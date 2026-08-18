// Whack-a-Mole Game 2.0 - Level Progression & Endless Modes

// ----------------------------------------------------
// Level Definitions & Configurations
// ----------------------------------------------------
const LEVEL_CONFIGS = [
  { level: 1, name: "Level 1: Backyard Sensor Test", targetScore: 5, moleTime: 2500, spawnDelay: 500 },
  { level: 2, name: "Level 2: Vegetable Patch", targetScore: 14, moleTime: 2800, spawnDelay: 800 },
  { level: 3, name: "Level 3: Grassy Meadow", targetScore: 18, moleTime: 2300, spawnDelay: 700 },
  { level: 4, name: "Level 4: Deep Woods", targetScore: 22, moleTime: 1900, spawnDelay: 600 },
  { level: 5, name: "Level 5: Mole Fortress", targetScore: 26, moleTime: 1550, spawnDelay: 500 },
  { level: 6, name: "Level 6: Whack Master", targetScore: 30, moleTime: 1250, spawnDelay: 400 }
];

const PROGRESS_KEY = 'whack_a_mole_progress_v1';
const PIXEL_FONT = '"Courier New", Courier, monospace';

function getGameProgress() {
  try {
    const saved = localStorage.getItem(PROGRESS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.warn('Unable to load progress from localStorage:', err);
  }
  return {
    unlockedLevel: 1,
    levelStars: {},       // { [level]: starsEarned }
    levelHighScores: {},  // { [level]: score }
    endlessHighScore: 0
  };
}

function saveGameProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn('Unable to save progress to localStorage:', err);
  }
}

// ----------------------------------------------------
// UI & Custom Cursor Helpers
// ----------------------------------------------------
function createCustomCursor(scene) {
  scene.input.setDefaultCursor('none');

  // Shadow ellipse positioned directly on the actual cursor centre
  const shadow = scene.add.ellipse(0, 0, 60, 30, 0x000000, 0.45);
  shadow.setOrigin(0.5, 0.5);
  shadow.setDepth(99);

  // Hammer image scaled and positioned
  const hammer = scene.add.image(0, 0, 'hammer');
  hammer.setScale(10);
  hammer.setOrigin(0.4, 0.6);
  hammer.setDepth(100);

  const cursorObj = {
    hammer,
    shadow,
    offsetX: 0,
    offsetY: 0,
    angle: 0,
    whackTween: null,
    shadowTween: null
  };

  return cursorObj;
}

function updateCustomCursor(pointer, cursorObj) {
  if (!cursorObj || !cursorObj.hammer) return;
  // Shadow is locked exactly onto the active pointer position
  cursorObj.shadow.x = pointer.x;
  cursorObj.shadow.y = pointer.y;

  // Hammer follows pointer plus dynamic slam offset and rotation
  cursorObj.hammer.x = pointer.x + cursorObj.offsetX;
  cursorObj.hammer.y = pointer.y + cursorObj.offsetY;
  cursorObj.hammer.angle = cursorObj.angle;
}

function triggerWhackAnimation(scene, cursorObj) {
  if (!cursorObj || !cursorObj.hammer) return;

  // Cancel any existing whack tween to prevent animation lock on spam clicks
  if (cursorObj.whackTween) {
    cursorObj.whackTween.stop();
    cursorObj.whackTween = null;
  }
  if (cursorObj.shadowTween) {
    cursorObj.shadowTween.stop();
    cursorObj.shadowTween = null;
  }

  // Slam hammer down onto the shadow / cursor centre
  cursorObj.whackTween = scene.tweens.add({
    targets: cursorObj,
    offsetX: 80,
    offsetY: 30,
    angle: -70,
    duration: 60,
    ease: 'Quad.easeOut',
    yoyo: true,
    hold: 25,
    onYoyo: () => {
      // Pulse shadow on ground impact
      cursorObj.shadow.setScale(1.25, 1.25);
      cursorObj.shadow.setAlpha(0.7);
    },
    onComplete: () => {
      cursorObj.offsetX = 0;
      cursorObj.offsetY = 0;
      cursorObj.angle = 0;
      cursorObj.whackTween = null;
    }
  });

  cursorObj.shadowTween = scene.tweens.add({
    targets: cursorObj.shadow,
    scaleX: 1.0,
    scaleY: 1.0,
    alpha: 0.45,
    duration: 150,
    ease: 'Quad.easeOut',
    onComplete: () => {
      cursorObj.shadowTween = null;
    }
  });
}

function renderBackground(scene) {
  const bg = scene.add.image(0, 0, 'background').setOrigin(0, 0);
  bg.setDisplaySize(1200, 800);
  bg.setDepth(0);
  return bg;
}

function createPixelButton(scene, x, y, width, height, text, onClick, options = {}) {
  const container = scene.add.container(x, y).setDepth(options.depth || 50);
  const bgColor = options.bgColor !== undefined ? options.bgColor : 0x27ae60;
  const hoverColor = options.hoverColor !== undefined ? options.hoverColor : 0x2ecc71;
  const borderColor = options.borderColor !== undefined ? options.borderColor : 0x145a32;
  const isDisabled = options.disabled || false;

  // Pixel style button with solid 4px border & drop shadow
  const shadow = scene.add.rectangle(4, 4, width, height, 0x000000, 0.5);
  const bg = scene.add.rectangle(0, 0, width, height, isDisabled ? 0x4a4a4a : bgColor);
  bg.setStrokeStyle(4, isDisabled ? 0x222222 : borderColor, 1);

  const label = scene.add.text(0, 0, text, {
    fontFamily: PIXEL_FONT,
    fontSize: options.fontSize || '22px',
    fontStyle: 'bold',
    color: isDisabled ? '#888888' : '#ffffff',
    align: 'center',
    stroke: '#000000',
    strokeThickness: 3
  }).setOrigin(0.5);

  container.add([shadow, bg, label]);

  if (!isDisabled) {
    bg.setInteractive({ useHandCursor: false });
    bg.on('pointerover', () => {
      bg.setFillStyle(hoverColor);
      container.setScale(1.03);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(bgColor);
      container.setScale(1.0);
    });
    bg.on('pointerdown', () => {
      container.setScale(0.96);
    });
    bg.on('pointerup', () => {
      container.setScale(1.0);
      onClick();
    });
  }

  return container;
}

// ----------------------------------------------------
// Boot Scene - Asset Loading
// ----------------------------------------------------
class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.image('background', 'assets/background.png');
    this.load.image('hole', 'assets/hole.png');
    this.load.image('hammer', 'assets/hammer1.png');
    this.load.image('mole', 'assets/mole.png');
    this.load.image('whacked-mole', 'assets/whacked-mole.png');
    this.load.image('missed-mole', 'assets/missed-mole.png');
  }

  create() {
    this.scene.start('MenuScene');
  }
}

// ----------------------------------------------------
// Main Menu Scene
// ----------------------------------------------------
class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    renderBackground(this);
    this.cursor = createCustomCursor(this);

    this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.35).setDepth(1);

    // Title Card with pixel border
    const titlePanel = this.add.container(600, 180).setDepth(2);
    const panelBg = this.add.rectangle(0, 0, 680, 140, 0x1e272e, 0.9);
    panelBg.setStrokeStyle(4, 0xf1c40f, 1);
    const panelShadow = this.add.rectangle(5, 5, 680, 140, 0x000000, 0.6);

    const title = this.add.text(0, -18, 'WHACK-A-MOLE', {
      fontFamily: PIXEL_FONT,
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    const subtitle = this.add.text(0, 36, 'SELECT GAME MODE', {
      fontFamily: PIXEL_FONT,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    titlePanel.add([panelShadow, panelBg, title, subtitle]);

    // Decorative Mole Sprites
    const leftMole = this.add.image(180, 200, 'mole').setScale(3.8).setDepth(3);
    const rightMole = this.add.image(1020, 200, 'whacked-mole').setScale(3.8).setDepth(3);

    this.tweens.add({
      targets: [leftMole, rightMole],
      y: '+=12',
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Buttons
    createPixelButton(this, 600, 380, 360, 70, '⭐ LEVELS MODE', () => {
      this.scene.start('LevelSelectScene');
    }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, fontSize: '24px' });

    createPixelButton(this, 600, 480, 360, 70, '⚡ ENDLESS MODE', () => {
      this.scene.start('GameScene', { mode: 'endless' });
    }, { bgColor: 0xd35400, hoverColor: 0xe67e22, borderColor: 0x7e3100, fontSize: '24px' });

    // Endless Best
    const progress = getGameProgress();
    const bestBox = this.add.container(600, 600).setDepth(3);
    const bestBg = this.add.rectangle(0, 0, 360, 44, 0x111111, 0.85);
    bestBg.setStrokeStyle(3, 0xffffff, 0.4);
    const bestText = this.add.text(0, 0, `ENDLESS BEST: ${progress.endlessHighScore}`, {
      fontFamily: PIXEL_FONT,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);
    bestBox.add([bestBg, bestText]);

    this.input.on('pointerdown', () => {
      triggerWhackAnimation(this, this.cursor);
    });
  }

  update() {
    updateCustomCursor(this.input.activePointer, this.cursor);
  }
}

// ----------------------------------------------------
// Level Select Scene
// ----------------------------------------------------
class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create() {
    renderBackground(this);
    this.cursor = createCustomCursor(this);

    this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.5).setDepth(1);

    // Header
    const headerBox = this.add.container(600, 85).setDepth(2);
    const headerBg = this.add.rectangle(0, 0, 440, 60, 0x1e272e, 0.95);
    headerBg.setStrokeStyle(4, 0xf1c40f, 1);
    const headerTxt = this.add.text(0, 0, 'SELECT LEVEL', {
      fontFamily: PIXEL_FONT,
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);
    headerBox.add([headerBg, headerTxt]);

    const progress = getGameProgress();
    const unlockedLevel = progress.unlockedLevel || 1;

    // Grid layout: 2 rows of 3 levels
    const cardW = 280;
    const cardH = 190;
    const startX = 300;
    const spacingX = 300;
    const startY = 240;
    const spacingY = 225;

    LEVEL_CONFIGS.forEach((cfg, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cx = startX + col * spacingX;
      const cy = startY + row * spacingY;
      const isUnlocked = cfg.level <= unlockedLevel;
      const starsEarned = progress.levelStars[cfg.level] || 0;
      const bestScore = progress.levelHighScores[cfg.level] || 0;

      const card = this.add.container(cx, cy).setDepth(2);
      const cardShadow = this.add.rectangle(4, 4, cardW, cardH, 0x000000, 0.5);
      const cardBg = this.add.rectangle(0, 0, cardW, cardH, isUnlocked ? 0x1b281b : 0x222222, 0.92);
      cardBg.setStrokeStyle(4, isUnlocked ? 0x2ecc71 : 0x555555, 1);
      card.add([cardShadow, cardBg]);

      if (isUnlocked) {
        cardBg.setInteractive({ useHandCursor: false });
        cardBg.on('pointerover', () => {
          cardBg.setFillStyle(0x27ae60, 0.95);
          card.setScale(1.03);
        });
        cardBg.on('pointerout', () => {
          cardBg.setFillStyle(0x1b281b, 0.92);
          card.setScale(1.0);
        });
        cardBg.on('pointerup', () => {
          this.scene.start('GameScene', { mode: 'level', levelIndex: idx });
        });

        // Level Title
        const lvlTitle = this.add.text(0, -58, cfg.name, {
          fontFamily: PIXEL_FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#f1c40f',
          stroke: '#000000',
          strokeThickness: 3
        }).setOrigin(0.5);

        // Target Score
        const targetTxt = this.add.text(0, -22, `TARGET: ${cfg.targetScore}`, {
          fontFamily: PIXEL_FONT,
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2
        }).setOrigin(0.5);

        // Stars display (3 stars)
        let starStr = '';
        for (let s = 1; s <= 3; s++) {
          starStr += s <= starsEarned ? '★ ' : '☆ ';
        }
        const starsTxt = this.add.text(0, 18, starStr.trim(), {
          fontFamily: PIXEL_FONT,
          fontSize: '32px',
          color: starsEarned > 0 ? '#f1c40f' : '#666666',
          stroke: '#000000',
          strokeThickness: 3
        }).setOrigin(0.5);

        // Best score
        const bestTxt = this.add.text(0, 58, bestScore > 0 ? `BEST: ${bestScore}` : 'NOT CLEARED', {
          fontFamily: PIXEL_FONT,
          fontSize: '15px',
          color: bestScore > 0 ? '#2ecc71' : '#888888',
          stroke: '#000000',
          strokeThickness: 2
        }).setOrigin(0.5);

        card.add([lvlTitle, targetTxt, starsTxt, bestTxt]);
      } else {
        // Locked card
        const lockIcon = this.add.text(0, -30, '🔒', { fontSize: '38px' }).setOrigin(0.5);
        const lockTxt = this.add.text(0, 18, `LEVEL ${cfg.level}`, {
          fontFamily: PIXEL_FONT,
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#888888',
          stroke: '#000000',
          strokeThickness: 3
        }).setOrigin(0.5);
        const reqTxt = this.add.text(0, 52, `BEAT LEVEL ${cfg.level - 1}`, {
          fontFamily: PIXEL_FONT,
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#666666'
        }).setOrigin(0.5);
        card.add([lockIcon, lockTxt, reqTxt]);
      }
    });

    // Back to Menu Button
    createPixelButton(this, 600, 710, 240, 55, '⬅ MAIN MENU', () => {
      this.scene.start('MenuScene');
    }, { bgColor: 0x555555, hoverColor: 0x777777, borderColor: 0x222222, fontSize: '18px' });

    this.input.on('pointerdown', () => {
      triggerWhackAnimation(this, this.cursor);
    });
  }

  update() {
    updateCustomCursor(this.input.activePointer, this.cursor);
  }
}

// ----------------------------------------------------
// Gameplay Scene (Levels & Endless Modes)
// ----------------------------------------------------
class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.gameMode = data.mode || 'endless';
    this.levelIndex = data.levelIndex || 0;
    this.levelConfig = this.gameMode === 'level' ? LEVEL_CONFIGS[this.levelIndex] : null;

    // Gameplay state
    this.score = 0;
    this.missedMoles = 0;
    this.maxMissedMoles = 3;
    this.activeMole = null;
    this.canWhack = true;
    this.gameOver = false;
    this.gameComplete = false;
    this.isPaused = false;

    // 1-minute time limit for Level mode
    this.levelTimeLeft = 20;
    this.levelTimerEvent = null;

    this.holes = [];
    this.moles = [];
    this.timerTween = null;
    this.pauseModalContainer = null;
  }

  create() {
    renderBackground(this);
    this.cursor = createCustomCursor(this);

    const CenterX = 600;
    const CenterY = 400;

    // Holes Setup
    // Level 1 prototype: only 2 holes for sensor testing
      const holePositions = [
      { x: CenterX - 200, y: CenterY },
      { x: CenterX + 200, y: CenterY }
    ];

    holePositions.forEach(pos => {
      const hole = this.add.image(pos.x, pos.y - 80, 'hole');
      hole.setDepth(5);
      hole.setScale(4);
      this.holes.push(hole);

      const mole = this.add.image(hole.x, hole.y + 80, 'mole');
      mole.setScale(4);
      mole.setVisible(false);
      mole.setDepth(6);
      this.moles.push(mole);
    });

    // Create Mole Timer Bar
    this.timerBar = this.createMoleTimerBar();
    this.timerBar.container.setVisible(false);

    // Setup Pixel-styled HUD
    this.setupHUD();

    // Level 60s Countdown Timer
    if (this.gameMode === 'level') {
      this.levelTimerEvent = this.time.addEvent({
        delay: 1000,
        repeat: 19,
        callback: () => {
          if (!this.isPaused) {
            this.levelTimeLeft--;
            this.updateHUD();
            if (this.levelTimeLeft <= 0) {
              this.handleLevelTimeUp();
            }
          }
        }
      });
    }

    // ESC Key for Pause Menu
    this.input.keyboard.on('keydown-ESC', () => {
      this.togglePause();
    });

    // Pointer Input for Whacking
    this.input.on('pointerdown', () => {
      if (this.canWhack && !this.gameOver && !this.gameComplete && !this.isPaused) {
        this.whackMole();
      }
    });

    // Start mole spawning after 1 second
    this.time.delayedCall(1000, () => this.activateRandomMole());
  }

  update() {
    updateCustomCursor(this.input.activePointer, this.cursor);
  }

  createMoleTimerBar() {
    const bg = this.add.rectangle(0, 0, 100, 12, 0x111111);
    bg.setStrokeStyle(2, 0x000000, 1);
    const bar = this.add.rectangle(0, 0, 96, 8, 0x2ecc71);
    const container = this.add.container(0, 0, [bg, bar]);
    container.setDepth(9);
    return { container, bar, maxWidth: 96 };
  }

  setupHUD() {
    // Pixel badges container across the top
    const hudContainer = this.add.container(0, 0).setDepth(20);

    // Background top bar
    const barBg = this.add.rectangle(600, 36, 1160, 52, 0x1e272e, 0.95);
    barBg.setStrokeStyle(4, 0x111111, 1);
    hudContainer.add(barBg);

    if (this.gameMode === 'level') {
      // Level Name Badge
      this.modeTitleLabel = this.add.text(50, 23, `LVL ${this.levelConfig.level}: ${this.levelConfig.name.split(':')[1].trim().toUpperCase()}`, {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
        stroke: '#000000',
        strokeThickness: 3
      });

      // Score
      this.scoreText = this.add.text(370, 23, 'SCORE: 0', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      });

      // Target
      this.targetText = this.add.text(520, 23, `TARGET: ${this.levelConfig.targetScore}`, {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#7bed9f',
        stroke: '#000000',
        strokeThickness: 3
      });

      // Timer
      this.timerText = this.add.text(690, 23, 'TIME: 60s', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffdd59',
        stroke: '#000000',
        strokeThickness: 3
      });

      // Lives
      this.livesText = this.add.text(850, 23, 'LIVES: ❤️ ❤️ ❤️', {
        fontFamily: PIXEL_FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#ff6b6b',
        stroke: '#000000',
        strokeThickness: 2
      });

      hudContainer.add([this.modeTitleLabel, this.scoreText, this.targetText, this.timerText, this.livesText]);
    } else {
      const progress = getGameProgress();

      this.modeTitleLabel = this.add.text(60, 23, 'ENDLESS MODE', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#e67e22',
        stroke: '#000000',
        strokeThickness: 3
      });

      this.scoreText = this.add.text(350, 23, 'SCORE: 0', {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      });

      this.targetText = this.add.text(530, 23, `BEST: ${progress.endlessHighScore}`, {
        fontFamily: PIXEL_FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
        stroke: '#000000',
        strokeThickness: 3
      });

      this.livesText = this.add.text(730, 23, 'LIVES: ❤️ ❤️ ❤️', {
        fontFamily: PIXEL_FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#ff6b6b',
        stroke: '#000000',
        strokeThickness: 2
      });

      hudContainer.add([this.modeTitleLabel, this.scoreText, this.targetText, this.livesText]);
    }

    // Integrated ESC / Pause Button badge in top right
    const pauseBadge = this.add.container(1110, 36).setDepth(25);
    const pauseBg = this.add.rectangle(0, 0, 90, 34, 0x333333);
    pauseBg.setStrokeStyle(3, 0x555555, 1);
    const pauseLabel = this.add.text(0, 0, 'ESC ⏸', {
      fontFamily: PIXEL_FONT,
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    pauseBadge.add([pauseBg, pauseLabel]);
    pauseBg.setInteractive({ useHandCursor: false });
    pauseBg.on('pointerover', () => pauseBg.setFillStyle(0x555555));
    pauseBg.on('pointerout', () => pauseBg.setFillStyle(0x333333));
    pauseBg.on('pointerup', () => this.togglePause());
  }

  updateHUD() {
    const remainingLives = Math.max(0, this.maxMissedMoles - this.missedMoles);
    let heartsStr = 'LIVES: ';
    for (let i = 0; i < this.maxMissedMoles; i++) {
      heartsStr += i < remainingLives ? '❤️ ' : '🖤 ';
    }

    if (this.gameMode === 'level') {
      this.scoreText.setText(`SCORE: ${this.score}`);
      if (this.score >= this.levelConfig.targetScore) {
        this.scoreText.setColor('#2ecc71');
      }
      this.timerText.setText(`TIME: ${this.levelTimeLeft}s`);
      if (this.levelTimeLeft <= 10) {
        this.timerText.setColor('#ff4d4d');
      }
      this.livesText.setText(heartsStr.trim());
    } else {
      this.scoreText.setText(`SCORE: ${this.score}`);
      this.livesText.setText(heartsStr.trim());
    }
  }

  togglePause() {
    if (this.gameOver || this.gameComplete) return;

    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    this.isPaused = true;
    if (this.levelTimerEvent) this.levelTimerEvent.paused = true;
    if (this.timerTween) this.timerTween.pause();

    // Create Pause Modal
    this.pauseModalContainer = this.add.container(600, 400).setDepth(60);

    const overlay = this.add.rectangle(0, 0, 1200, 800, 0x000000, 0.7);
    overlay.setInteractive(); // Blocks clicks to background

    const panelBg = this.add.rectangle(0, 0, 480, 360, 0x1e272e, 0.96);
    panelBg.setStrokeStyle(4, 0xf1c40f, 1);
    const panelShadow = this.add.rectangle(5, 5, 480, 360, 0x000000, 0.6);

    const title = this.add.text(0, -120, 'GAME PAUSED', {
      fontFamily: PIXEL_FONT,
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);

    this.pauseModalContainer.add([overlay, panelShadow, panelBg, title]);

    // Resume Button
    const resumeBtn = createPixelButton(this, 600, 350, 260, 52, 'RESUME', () => {
      this.resumeGame();
    }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, depth: 65 });

    // Restart Button
    const restartBtn = createPixelButton(this, 600, 420, 260, 52, 'RESTART', () => {
      this.scene.start('GameScene', { mode: this.gameMode, levelIndex: this.levelIndex });
    }, { bgColor: 0x2980b9, hoverColor: 0x3498db, borderColor: 0x1a5276, depth: 65 });

    // Exit to Menu Button
    const exitBtn = createPixelButton(this, 600, 490, 260, 52, this.gameMode === 'level' ? 'LEVEL SELECT' : 'MAIN MENU', () => {
      if (this.gameMode === 'level') {
        this.scene.start('LevelSelectScene');
      } else {
        this.scene.start('MenuScene');
      }
    }, { bgColor: 0x7f8c8d, hoverColor: 0x95a5a6, borderColor: 0x333333, depth: 65 });

    this.pauseModalContainer.buttons = [resumeBtn, restartBtn, exitBtn];
  }

  resumeGame() {
    this.isPaused = false;
    if (this.levelTimerEvent) this.levelTimerEvent.paused = false;
    if (this.timerTween) this.timerTween.resume();

    if (this.pauseModalContainer) {
      if (this.pauseModalContainer.buttons) {
        this.pauseModalContainer.buttons.forEach(btn => btn.destroy());
      }
      this.pauseModalContainer.destroy();
      this.pauseModalContainer = null;
    }
  }

  getMoleDuration() {
    if (this.gameMode === 'level') {
      return this.levelConfig.moleTime;
    }
    return Math.max(900, 3200 - this.score * 75);
  }

  getMoleSpawnDelay() {
    if (this.gameMode === 'level') {
      return this.levelConfig.spawnDelay;
    }
    return Math.max(400, 1000 - this.score * 20);
  }

  activateRandomMole() {
    if (this.activeMole || this.gameOver || this.gameComplete || this.isPaused) {
      return;
    }

    const randomIndex = Phaser.Math.Between(0, this.moles.length - 1);
    const selectedMole = this.moles[randomIndex];
    const hole = this.holes[randomIndex];

    selectedMole.setTexture('mole');
    this.activeMole = selectedMole;
    selectedMole.x = hole.x;
    selectedMole.y = hole.y + 80;
    selectedMole.setVisible(true);

    const moleDuration = this.getMoleDuration();

    if (this.timerTween) {
      this.timerTween.stop();
      this.timerTween = null;
    }
    this.timerBar.bar.width = this.timerBar.maxWidth;
    this.timerBar.container.setVisible(true);
    this.timerBar.container.x = hole.x;
    this.timerBar.container.y = hole.y - 60;

    this.timerTween = this.tweens.add({
      targets: this.timerBar.bar,
      width: 0,
      duration: moleDuration,
      ease: 'Linear',
      onComplete: () => {
        this.timerTween = null;
        if (this.activeMole === selectedMole && !this.gameOver && !this.gameComplete) {
          selectedMole.setTexture('missed-mole');
          this.missedMoles++;
          this.updateHUD();
          this.deactivateMole(selectedMole, false);

          if (this.missedMoles >= this.maxMissedMoles) {
            if (this.gameMode === 'level') {
              this.handleLevelLostLives();
            } else {
              this.handleEndlessGameOver();
            }
          }
        }
      }
    });

    this.tweens.add({
      targets: selectedMole,
      y: hole.y - 5,
      duration: 250,
      ease: 'Back.easeOut'
    });
  }

  deactivateMole(mole, wasWhacked = false) {
    if (!this.activeMole) return;

    if (this.timerTween) {
      this.timerTween.stop();
      this.timerTween = null;
    }
    this.timerBar.container.setVisible(false);

    const index = this.moles.indexOf(mole);
    if (index === -1) return;

    const hole = this.holes[index];

    this.tweens.add({
      targets: mole,
      y: hole.y + 80,
      duration: wasWhacked ? 200 : 260,
      ease: 'Back.easeIn',
      onComplete: () => {
        mole.setVisible(false);
        if (this.activeMole === mole) {
          this.activeMole = null;
        }

        if (!this.gameOver && !this.gameComplete && !this.isPaused) {
          const spawnDelay = this.getMoleSpawnDelay();
          this.time.delayedCall(spawnDelay, () => this.activateRandomMole());
        }
      }
    });
  }

  whackMole() {
    triggerWhackAnimation(this, this.cursor);

    const mole = this.activeMole;
    if (!mole) return;

    const strikeX = this.cursor.shadow.x;
    const strikeY = this.cursor.shadow.y;
    const dist = Phaser.Math.Distance.Between(strikeX, strikeY, mole.x, mole.y);

    if (dist < 85) {
      mole.setTexture('whacked-mole');
      this.score += 1;
      this.updateHUD();

      const bonusActive = this.gameMode === 'level' && this.score > this.levelConfig.targetScore;
      const popupText = bonusActive ? '+1 BONUS' : '+1';
      const popup = this.add.text(mole.x, mole.y - 40, popupText, {
        fontFamily: PIXEL_FONT,
        fontSize: bonusActive ? '26px' : '22px',
        fontStyle: 'bold',
        color: bonusActive ? '#f1c40f' : '#2ecc71',
        stroke: '#000000',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(30);

      this.tweens.add({
        targets: popup,
        y: popup.y - 40,
        alpha: 0,
        duration: 600,
        onComplete: () => popup.destroy()
      });

      this.deactivateMole(mole, true);
    }
  }

  handleLevelLostLives() {
    this.gameOver = true;
    this.canWhack = false;
    if (this.levelTimerEvent) this.levelTimerEvent.remove();
    if (this.timerTween) this.timerTween.stop();
    this.timerBar.container.setVisible(false);

    const overlay = this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.75).setDepth(50);
    const panel = this.add.container(600, 400).setDepth(51);
    const panelBg = this.add.rectangle(0, 0, 600, 420, 0x1e272e, 0.96);
    panelBg.setStrokeStyle(4, 0xe74c3c, 1);
    const panelShadow = this.add.rectangle(5, 5, 600, 420, 0x000000, 0.6);

    const title = this.add.text(0, -140, 'OUT OF LIVES', {
      fontFamily: PIXEL_FONT,
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#e74c3c',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);

    const subtitle = this.add.text(0, -90, '🖤 🖤 🖤', {
      fontFamily: PIXEL_FONT,
      fontSize: '26px'
    }).setOrigin(0.5);

    const stats = this.add.text(0, -5,
      `LEVEL: ${this.levelConfig.name.toUpperCase()}\nSCORE: ${this.score} / TARGET: ${this.levelConfig.targetScore}\nTIME LEFT: ${this.levelTimeLeft}s\n\nALL 3 LIVES LOST`, {
      fontFamily: PIXEL_FONT,
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 8,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    panel.add([panelShadow, panelBg, title, subtitle, stats]);

    // Buttons
    createPixelButton(this, 600 - 130, 400 + 135, 210, 52, 'RESTART LEVEL ↺', () => {
      this.scene.start('GameScene', { mode: 'level', levelIndex: this.levelIndex });
    }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, fontSize: '17px', depth: 60 });

    createPixelButton(this, 600 + 130, 400 + 135, 180, 52, 'LEVEL SELECT ☰', () => {
      this.scene.start('LevelSelectScene');
    }, { bgColor: 0x7f8c8d, hoverColor: 0x95a5a6, borderColor: 0x333333, fontSize: '17px', depth: 60 });
  }

  handleLevelTimeUp() {
    this.gameComplete = true;
    this.canWhack = false;
    if (this.timerTween) this.timerTween.stop();
    this.timerBar.container.setVisible(false);

    const target = this.levelConfig.targetScore;
    const passed = this.score >= target;
    const progress = getGameProgress();

    // 3 Stars evaluation
    let star1 = passed;
    let star2 = this.score > target;
    let star3 = passed && (this.missedMoles === 0);
    let totalStars = (star1 ? 1 : 0) + (star2 ? 1 : 0) + (star3 ? 1 : 0);

    if (passed) {
      const currentLevel = this.levelConfig.level;
      if (currentLevel >= progress.unlockedLevel && currentLevel < LEVEL_CONFIGS.length) {
        progress.unlockedLevel = currentLevel + 1;
      }
      const existingStars = progress.levelStars[currentLevel] || 0;
      progress.levelStars[currentLevel] = Math.max(existingStars, totalStars);

      const existingHigh = progress.levelHighScores[currentLevel] || 0;
      progress.levelHighScores[currentLevel] = Math.max(existingHigh, this.score);
      saveGameProgress(progress);
    }

    this.showLevelResultModal(passed, totalStars, star1, star2, star3);
  }

  showLevelResultModal(passed, totalStars, star1, star2, star3) {
    const overlay = this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.75).setDepth(50);

    const panel = this.add.container(600, 380).setDepth(51);
    const panelBg = this.add.rectangle(0, 0, 650, 500, 0x1e272e, 0.96);
    panelBg.setStrokeStyle(4, passed ? 0x2ecc71 : 0xe74c3c, 1);
    const panelShadow = this.add.rectangle(5, 5, 650, 500, 0x000000, 0.6);
    panel.add([panelShadow, panelBg]);

    const titleStr = passed ? 'LEVEL COMPLETE!' : 'TIME UP - LEVEL FAILED';
    const titleColor = passed ? '#2ecc71' : '#e74c3c';
    const resultTitle = this.add.text(0, -200, titleStr, {
      fontFamily: PIXEL_FONT,
      fontSize: '34px',
      fontStyle: 'bold',
      color: titleColor,
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);
    panel.add(resultTitle);

    if (passed) {
      const starDescs = [
        'Complete Level',
        'Exceed Target',
        'Perfect Accuracy'
      ];
      const starEarnedList = [star1, star2, star3];

      for (let i = 0; i < 3; i++) {
        const starX = -120 + i * 120;
        const starY = -135;
        const starChar = starEarnedList[i] ? '★' : '☆';
        const starColor = starEarnedList[i] ? '#f1c40f' : '#636e72';

        const starIcon = this.add.text(starX, starY, starChar, {
          fontFamily: PIXEL_FONT,
          fontSize: '52px',
          color: starColor,
          stroke: '#000000',
          strokeThickness: 4
        }).setOrigin(0.5);
        panel.add(starIcon);

        if (starEarnedList[i]) {
          starIcon.setScale(0);
          this.tweens.add({
            targets: starIcon,
            scale: 1.2,
            duration: 350,
            delay: 200 + i * 200,
            ease: 'Back.easeOut',
            onComplete: () => {
              this.tweens.add({ targets: starIcon, scale: 1.0, duration: 150 });
            }
          });
        }
      }

      let starDetailY = -60;
      starEarnedList.forEach((earned, i) => {
        const checkIcon = earned ? '✔' : '✖';
        const checkColor = earned ? '#2ecc71' : '#e74c3c';
        const descTxt = this.add.text(-200, starDetailY + i * 28, `${checkIcon} ${starDescs[i]}`, {
          fontFamily: PIXEL_FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: checkColor,
          stroke: '#000000',
          strokeThickness: 2
        });
        panel.add(descTxt);
      });

      const bonusCount = Math.max(0, this.score - this.levelConfig.targetScore);
      const scoreSummary = this.add.text(0, 55,
        `WHACKED: ${this.score} | TARGET: ${this.levelConfig.targetScore}\nBONUS: ${bonusCount} | MISSES: ${this.missedMoles}`, {
        fontFamily: PIXEL_FONT,
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8,
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5);
      panel.add(scoreSummary);

    } else {
      const failInfo = this.add.text(0, -60,
        `TARGET: ${this.levelConfig.targetScore}\nYOUR SCORE: ${this.score}\nMISSES: ${this.missedMoles}\n\nTARGET NOT REACHED`, {
        fontFamily: PIXEL_FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 12,
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5);
      panel.add(failInfo);
    }

    // Action Buttons
    const hasNextLevel = passed && (this.levelIndex + 1 < LEVEL_CONFIGS.length);
    const btnY = 175;

    if (hasNextLevel) {
      createPixelButton(this, 600 + 180, 380 + btnY, 180, 52, 'NEXT LEVEL ➡', () => {
        this.scene.start('GameScene', { mode: 'level', levelIndex: this.levelIndex + 1 });
      }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, fontSize: '17px', depth: 60 });

      createPixelButton(this, 600, 380 + btnY, 140, 52, 'RETRY ↺', () => {
        this.scene.start('GameScene', { mode: 'level', levelIndex: this.levelIndex });
      }, { bgColor: 0x2980b9, hoverColor: 0x3498db, borderColor: 0x1a5276, fontSize: '17px', depth: 60 });

      createPixelButton(this, 600 - 180, 380 + btnY, 160, 52, 'LEVELS ☰', () => {
        this.scene.start('LevelSelectScene');
      }, { bgColor: 0x7f8c8d, hoverColor: 0x95a5a6, borderColor: 0x333333, fontSize: '17px', depth: 60 });
    } else {
      createPixelButton(this, 600 + 120, 380 + btnY, 180, 52, 'RETRY ↺', () => {
        this.scene.start('GameScene', { mode: 'level', levelIndex: this.levelIndex });
      }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, fontSize: '17px', depth: 60 });

      createPixelButton(this, 600 - 120, 380 + btnY, 180, 52, 'LEVELS ☰', () => {
        this.scene.start('LevelSelectScene');
      }, { bgColor: 0x7f8c8d, hoverColor: 0x95a5a6, borderColor: 0x333333, fontSize: '17px', depth: 60 });
    }
  }

  handleEndlessGameOver() {
    this.gameOver = true;
    this.canWhack = false;
    if (this.timerTween) this.timerTween.stop();
    this.timerBar.container.setVisible(false);

    const progress = getGameProgress();
    const isNewHigh = this.score > progress.endlessHighScore;
    if (isNewHigh) {
      progress.endlessHighScore = this.score;
      saveGameProgress(progress);
    }

    const overlay = this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.75).setDepth(50);
    const panel = this.add.container(600, 400).setDepth(51);
    const panelBg = this.add.rectangle(0, 0, 550, 400, 0x1e272e, 0.96);
    panelBg.setStrokeStyle(4, 0xe74c3c, 1);
    const panelShadow = this.add.rectangle(5, 5, 550, 400, 0x000000, 0.6);
    panel.add([panelShadow, panelBg]);

    const title = this.add.text(0, -130, 'GAME OVER', {
      fontFamily: PIXEL_FONT,
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#e74c3c',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);

    const scoreTxt = this.add.text(0, -45, `FINAL SCORE: ${this.score}`, {
      fontFamily: PIXEL_FONT,
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    const highTxt = this.add.text(0, 15, isNewHigh ? '🏆 NEW HIGH SCORE!' : `ENDLESS BEST: ${progress.endlessHighScore}`, {
      fontFamily: PIXEL_FONT,
      fontSize: '20px',
      fontStyle: 'bold',
      color: isNewHigh ? '#f1c40f' : '#bdc3c7',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    panel.add([title, scoreTxt, highTxt]);

    // Buttons
    createPixelButton(this, 600 - 120, 400 + 110, 190, 55, 'PLAY AGAIN ↺', () => {
      this.scene.start('GameScene', { mode: 'endless' });
    }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, fontSize: '17px', depth: 60 });

    createPixelButton(this, 600 + 120, 400 + 110, 190, 55, 'MAIN MENU ☰', () => {
      this.scene.start('MenuScene');
    }, { bgColor: 0x7f8c8d, hoverColor: 0x95a5a6, borderColor: 0x333333, fontSize: '17px', depth: 60 });
  }
}

// ----------------------------------------------------
// Phaser Game Configuration
// ----------------------------------------------------
const config = {
  type: Phaser.AUTO,
  width: 1200,
  height: 800,
  backgroundColor: '#93da60',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene]
};

const game = new Phaser.Game(config);
