import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
}

@Component({
  selector: 'app-game',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class Game implements OnDestroy {
  // Game Configuration presets
  difficulty: string = 'easy';
  rows: number = 8;
  cols: number = 8;
  mines: number = 10;

  // Custom configuration fields
  customRows: number = 8;
  customCols: number = 8;
  customMines: number = 10;

  // Grid navigation directions
  directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  board: Cell[][] = [];
  gameOver = false;
  win = false;
  firstClick = true;

  // Game stats
  timerInterval: any = null;
  timeElapsed: number = 0;
  minesLeft: number = 0;
  score: number = 0;
  scoreUpdated = false;
  baseScore = 0;
  timeBonus = 0;
  winBonus = 0;
  combo: number = 0;
  maxCombo: number = 0;
  lastRevealTime: number = 0;

  lastMove = {
    row: -1,
    col: -1,
    action: ''
  };

  // Sound Settings
  soundEnabled = true;

  // High Scores
  highScores = {
    easy: { time: 999, score: 0 },
    medium: { time: 999, score: 0 },
    hard: { time: 999, score: 0 }
  };

  // UI state toggles
  showCustomConfig = false;
  showHelp = false;
  showResumePrompt = false;

  // Confetti canvas animation properties
  confettiActive = false;
  confettiAnimationId: any = null;

  constructor() {
    this.loadHighScores();
    this.loadSoundSetting();
    const saved = localStorage.getItem('minesweeper');

    if (saved) {
      try {
        const game = JSON.parse(saved);
        if (game.gameOver) {
          localStorage.removeItem('minesweeper');
          this.createBoard();
        } else {
          this.showResumePrompt = true;
        }
      } catch (e) {
        localStorage.removeItem('minesweeper');
        this.createBoard();
      }
    } else {
      this.createBoard();
    }
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.stopConfetti();
  }

  loadHighScores() {
    const saved = localStorage.getItem('minesweeper_high_scores');
    if (saved) {
      try {
        this.highScores = JSON.parse(saved);
      } catch (e) {
        console.warn('Could not load high scores:', e);
      }
    }
  }

  loadSoundSetting() {
    const saved = localStorage.getItem('minesweeper_sound_enabled');
    if (saved !== null) {
      this.soundEnabled = saved === 'true';
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('minesweeper_sound_enabled', String(this.soundEnabled));
  }

  acceptResume() {
    this.showResumePrompt = false;
    this.loadGame();
  }

  declineResume() {
    this.showResumePrompt = false;
    localStorage.removeItem('minesweeper');
    this.createBoard();
  }

  addScore(points: number) {
    this.score += points;
    this.scoreUpdated = true;
    setTimeout(() => {
      this.scoreUpdated = false;
    }, 300);
  }

  createBoard() {
    this.stopConfetti();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.mines >= this.rows * this.cols) {
      this.mines = Math.max(1, this.rows * this.cols - 9);
    }

    this.board = [];
    this.firstClick = true;
    this.gameOver = false;
    this.win = false;
    this.timeElapsed = 0;
    this.minesLeft = this.mines;
    this.score = 0;
    this.baseScore = 0;
    this.timeBonus = 0;
    this.winBonus = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastRevealTime = 0;

    this.lastMove = {
      row: -1,
      col: -1,
      action: ''
    };

    // Create blank board grid
    for (let i = 0; i < this.rows; i++) {
      let row: Cell[] = [];
      for (let j = 0; j < this.cols; j++) {
        row.push({
          mine: false,
          revealed: false,
          flagged: false,
          adjacent: 0
        });
      }
      this.board.push(row);
    }
  }

  placeMines(clickedRow: number, clickedCol: number) {
    let placedMine = 0;
    const totalCells = this.rows * this.cols;
    const excludeNeighborhood = (totalCells - this.mines) > 9;

    while (placedMine < this.mines) {
      let row = Math.floor(Math.random() * this.rows);
      let column = Math.floor(Math.random() * this.cols);

      let isExcluded = false;
      if (excludeNeighborhood) {
        // Exclude 3x3 surrounding clicked cell
        isExcluded = Math.abs(row - clickedRow) <= 1 && Math.abs(column - clickedCol) <= 1;
      } else {
        // Exclude only the clicked cell
        isExcluded = row === clickedRow && column === clickedCol;
      }

      if (!isExcluded && !this.board[row][column].mine) {
        this.board[row][column].mine = true;
        placedMine++;
      }
    }
  }

  calculateNumbers() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].mine) {
          continue;
        }

        let count = 0;
        for (let drct of this.directions) {
          let newRow = r + drct[0];
          let newColumn = c + drct[1];

          if (
            newRow >= 0 &&
            newRow < this.rows &&
            newColumn >= 0 &&
            newColumn < this.cols &&
            this.board[newRow][newColumn].mine
          ) {
            count++;
          }
        }
        this.board[r][c].adjacent = count;
      }
    }
  }

  reveal(row: number, column: number) {
    if (this.gameOver || this.win) {
      return;
    }

    let cell = this.board[row][column];

    // Quick-reveal (Chord click)
    if (cell.revealed) {
      this.chordReveal(row, column);
      return;
    }

    if (cell.flagged) {
      return;
    }

    // Safety on first move
    if (this.firstClick) {
      this.firstClick = false;
      this.placeMines(row, column);
      this.calculateNumbers();
      this.startTimer();
    }

    cell.revealed = true;
    this.playTone('click');

    // Combo multiplier system
    const now = Date.now();
    if (this.lastRevealTime > 0 && now - this.lastRevealTime < 1500) {
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
    } else {
      this.combo = 0;
    }
    this.lastRevealTime = now;

    // Score increments based on combo speed
    this.addScore(10 * (1 + this.combo));

    this.lastMove = {
      row: row,
      col: column,
      action: 'Reveal'
    };

    if (cell.mine) {
      this.handleLoss(row, column);
      return;
    }

    if (cell.adjacent === 0) {
      this.expand(row, column);
    }

    this.checkWin();
    if (!this.gameOver && !this.win) {
      this.saveGame();
    }
  }

  chordReveal(row: number, col: number) {
    let cell = this.board[row][col];
    if (cell.adjacent === 0) return;

    // Count adjacent flags
    let flagCount = 0;
    for (let drct of this.directions) {
      let r = row + drct[0];
      let c = col + drct[1];
      if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
        if (this.board[r][c].flagged && !this.board[r][c].revealed) {
          flagCount++;
        }
      }
    }

    // If flags count matches surrounding numbers, reveal other unflagged neighbors
    if (flagCount === cell.adjacent) {
      for (let drct of this.directions) {
        let r = row + drct[0];
        let c = col + drct[1];
        if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
          let neighbor = this.board[r][c];
          if (!neighbor.revealed && !neighbor.flagged) {
            this.reveal(r, c);
          }
        }
      }
    }
  }

  expand(row: number, column: number) {
    for (let drt of this.directions) {
      let newRow = row + drt[0];
      let newColumn = column + drt[1];

      if (newRow >= 0 && newRow < this.rows && newColumn >= 0 && newColumn < this.cols) {
        let cell = this.board[newRow][newColumn];

        if (!cell.revealed && !cell.mine) {
          cell.revealed = true;
          this.addScore(10); // score bonus for cascaded cells

          if (cell.adjacent === 0) {
            this.expand(newRow, newColumn);
          }
        }
      }
    }
  }

  toggleFlag(event: MouseEvent, row: number, column: number) {
    event.preventDefault();

    if (this.gameOver || this.win) {
      return;
    }

    let cell = this.board[row][column];
    if (cell.revealed) {
      return;
    }

    cell.flagged = !cell.flagged;
    this.playTone('flag');

    this.minesLeft = this.mines - this.countFlags();

    this.lastMove = {
      row: row,
      col: column,
      action: cell.flagged ? 'Flag Added' : 'Flag Removed'
    };

    this.saveGame();
  }

  countFlags(): number {
    let count = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].flagged && !this.board[r][c].revealed) {
          count++;
        }
      }
    }
    return count;
  }

  handleLoss(clickedRow: number, clickedCol: number) {
    this.gameOver = true;
    this.win = false;
    this.playTone('lose');
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Reveal all mines and mark the clicked one specially
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].mine) {
          this.board[r][c].revealed = true;
        }
      }
    }

    localStorage.removeItem('minesweeper');
  }

  checkWin() {
    for (let row of this.board) {
      for (let cell of row) {
        if (!cell.mine && !cell.revealed) {
          return;
        }
      }
    }

    this.win = true;
    this.gameOver = true;
    this.playTone('win');

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Calculate score breakdown
    this.baseScore = this.score;
    this.winBonus = this.mines * 50;
    // Time limit depends on board size. 4 seconds per cell.
    const timeLimit = this.rows * this.cols * 4;
    this.timeBonus = Math.max(0, (timeLimit - this.timeElapsed) * 5);
    
    // Add win and time bonuses to score
    this.addScore(this.winBonus + this.timeBonus);

    // Update High Scores for preset difficulties
    if (this.difficulty === 'easy' || this.difficulty === 'medium' || this.difficulty === 'hard') {
      const currentHigh = this.highScores[this.difficulty as 'easy' | 'medium' | 'hard'];

      let newBestTime = currentHigh.time;
      if (this.timeElapsed < currentHigh.time || currentHigh.time === 0 || currentHigh.time === 999) {
        newBestTime = this.timeElapsed;
      }

      let newBestScore = Math.max(currentHigh.score, this.score);

      this.highScores[this.difficulty as 'easy' | 'medium' | 'hard'] = {
        time: newBestTime,
        score: newBestScore
      };

      localStorage.setItem('minesweeper_high_scores', JSON.stringify(this.highScores));
    }

    // Auto-flag all mines on win
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].mine) {
          this.board[r][c].flagged = true;
        }
      }
    }
    this.minesLeft = 0;
    localStorage.removeItem('minesweeper');

    // Trigger canvas confetti animation
    setTimeout(() => {
      this.triggerConfetti();
    }, 150);
  }

  startTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.timerInterval = setInterval(() => {
      this.timeElapsed++;
      this.saveGame();
    }, 1000);
  }

  restart() {
    this.stopConfetti();
    localStorage.removeItem('minesweeper');
    this.createBoard();
  }

  levelEasy() {
    this.difficulty = 'easy';
    this.rows = 8;
    this.cols = 8;
    this.mines = 10;
    this.showCustomConfig = false;
    this.restart();
  }

  levelMedium() {
    this.difficulty = 'medium';
    this.rows = 10;
    this.cols = 10;
    this.mines = 15;
    this.showCustomConfig = false;
    this.restart();
  }

  levelHard() {
    this.difficulty = 'hard';
    this.rows = 14;
    this.cols = 14;
    this.mines = 30;
    this.showCustomConfig = false;
    this.restart();
  }

  toggleCustomConfig() {
    this.showCustomConfig = !this.showCustomConfig;
    if (this.showCustomConfig) {
      this.customRows = this.rows;
      this.customCols = this.cols;
      this.customMines = this.mines;
    }
  }

  generateCustom() {
    if (this.customRows < 6 || this.customCols < 6) {
      alert('Grid dimensions must be at least 6x6.');
      return;
    }
    if (this.customRows > 16 || this.customCols > 16) {
      alert('Grid dimensions must be at most 16x16.');
      return;
    }
    const maxMines = Math.floor((this.customRows * this.customCols) * 0.7);
    if (this.customMines >= maxMines) {
      alert(`Too many mines! Max allowed for this grid size is ${maxMines}.`);
      return;
    }
    if (this.customMines < 1) {
      alert('Must place at least 1 mine.');
      return;
    }

    this.difficulty = 'custom';
    this.rows = this.customRows;
    this.cols = this.customCols;
    this.mines = this.customMines;
    this.showCustomConfig = false;
    this.restart();
  }

  saveGame() {
    if (this.gameOver || this.win || this.firstClick) {
      return;
    }

    const gameData = {
      difficulty: this.difficulty,
      rows: this.rows,
      cols: this.cols,
      mines: this.mines,
      board: this.board,
      gameOver: this.gameOver,
      win: this.win,
      lastMove: this.lastMove,
      timeElapsed: this.timeElapsed,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      soundEnabled: this.soundEnabled
    };

    localStorage.setItem('minesweeper', JSON.stringify(gameData));
  }

  loadGame() {
    const data = localStorage.getItem('minesweeper');
    if (!data) return;

    try {
      const game = JSON.parse(data);
      this.difficulty = game.difficulty || 'easy';
      this.rows = game.rows;
      this.cols = game.cols;
      this.mines = game.mines;
      this.board = game.board;
      this.gameOver = game.gameOver;
      this.win = game.win;
      this.lastMove = game.lastMove || { row: -1, col: -1, action: '' };
      this.timeElapsed = game.timeElapsed || 0;
      this.score = game.score || 0;
      this.combo = game.combo || 0;
      this.maxCombo = game.maxCombo || 0;
      this.soundEnabled = game.soundEnabled !== undefined ? game.soundEnabled : true;
      this.firstClick = false;
      this.minesLeft = this.mines - this.countFlags();

      if (!this.gameOver && !this.win) {
        this.startTimer();
      }
    } catch (e) {
      console.error('Failed to load saved game:', e);
      this.createBoard();
    }
  }

  // Synthesizes retro sounds using the browser Web Audio API
  playTone(type: string) {
    if (!this.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'click') {
        // Crisp bubble pop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.08);

        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
      else if (type === 'flag') {
        // Quick synthetic tick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.06);

        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.06);

        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      }
      else if (type === 'win') {
        // Triumphant melody (C Major Chord)
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4 - E4 - G4 - C5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

          gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.08 + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.3);

          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.3);
        });
      }
      else if (type === 'lose') {
        // Low frequency noise explosion
        const bufferSize = ctx.sampleRate * 0.4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.4);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        noise.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      console.warn('Audio Context error:', e);
    }
  }

  // 2D particle confetti falling simulation
  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.confettiActive = true;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: any[] = [];
    const colors = ['#a855f7', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 5 + 3,
        d: Math.random() * canvas.height,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 8 - 4,
        tiltAngleIncremental: Math.random() * 0.05 + 0.02,
        tiltAngle: 0
      });
    }

    const draw = () => {
      if (!this.confettiActive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let activeParticles = 0;
      particles.forEach((p) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2.2;
        p.x += Math.sin(p.tiltAngle) * 0.8;
        p.tilt = Math.sin(p.tiltAngle - p.r / 2) * 4;

        if (p.y <= canvas.height) {
          activeParticles++;
        }

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });

      if (activeParticles > 0 && this.confettiActive) {
        this.confettiAnimationId = requestAnimationFrame(draw);
      } else {
        this.confettiActive = false;
      }
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    draw();
  }

  formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  stopConfetti() {
    this.confettiActive = false;
    if (this.confettiAnimationId) {
      cancelAnimationFrame(this.confettiAnimationId);
    }
    const canvas = document.getElementById('confetti-canvas') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
