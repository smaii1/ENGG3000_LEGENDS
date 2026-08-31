// ----------------------------------------------------
// Level Definitions & Configurations
// ----------------------------------------------------
const LEVEL_CONFIGS = [
  { level: 1, name: "Level 1: Backyard", targetScore: 10, moleTime: 6400, spawnDelay: 900, holes: 2 },
  { level: 2, name: "Level 2: Vegetable Patch", targetScore: 14, moleTime: 5800, spawnDelay: 800, holes: 3 },
  { level: 3, name: "Level 3: Grassy Meadow", targetScore: 18, moleTime: 2300, spawnDelay: 700, holes: 4 },
  { level: 4, name: "Level 4: Deep Woods", targetScore: 22, moleTime: 1900, spawnDelay: 600, holes: 6 },
  { level: 5, name: "Level 5: Mole Fortress", targetScore: 26, moleTime: 1550, spawnDelay: 500, holes: 6 },
  { level: 6, name: "Level 6: Whack Master", targetScore: 30, moleTime: 1250, spawnDelay: 400, holes: 6 }
];

function getHolePositions(count = 6) {
  const CenterX = 600;
  const CenterY = 400;

  switch (count) {
    case 2:
      // 2 horizontal holes (left and right with comfortable spacing for movement)
      return [
        { x: CenterX - 300, y: CenterY },
        { x: CenterX + 300, y: CenterY }
      ];
    case 3:
      // 3 holes in a balanced triangular layout
      return [
        { x: CenterX, y: CenterY - 130 },
        { x: CenterX - 320, y: CenterY + 130 },
        { x: CenterX + 320, y: CenterY + 130 }
      ];
    case 4:
      // 4 holes in a 2x2 grid
      return [
        { x: CenterX - 300, y: CenterY - 140 },
        { x: CenterX + 300, y: CenterY - 140 },
        { x: CenterX - 300, y: CenterY + 140 },
        { x: CenterX + 300, y: CenterY + 140 }
      ];
    case 6:
    default:
      // 6 holes in standard 3x2 grid
      return [
        { x: CenterX - 400, y: CenterY - 150 },
        { x: CenterX, y: CenterY - 150 },
        { x: CenterX + 400, y: CenterY - 150 },
        { x: CenterX - 400, y: CenterY + 150 },
        { x: CenterX, y: CenterY + 150 },
        { x: CenterX + 400, y: CenterY + 150 }
      ];
  }
}

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
// UI & Custom Cursor Helpers with Tracker Support
// ----------------------------------------------------
function createCustomCursor(scene) {
  scene.input.setDefaultCursor('none');

  // Shadow ellipse positioned directly on the actual cursor centre (high contrast with white border)
  const shadow = scene.add.ellipse(0, 0, 64, 32, 0x000000, 0.65);
  shadow.setStrokeStyle(2, 0xffffff, 0.85);
  shadow.setOrigin(0.5, 0.5);
  shadow.setDepth(99);

  // Hammer image scaled and positioned
  const hammer = scene.add.image(0, 0, 'hammer');
  hammer.setScale(10);
  hammer.setOrigin(0.4, 0.6);
  hammer.setDepth(100);

  const dwellRing = scene.add.graphics();
  dwellRing.setDepth(101);

  const cursorObj = {
    hammer,
    shadow,
    dwellRing,
    offsetX: 0,
    offsetY: 0,
    slamAngle: 0,
    tiltAngle: 0,
    lastX: 600,
    lastY: 400,
    vx: 0,
    vy: 0,
    whackTween: null,
    shadowTween: null
  };

  return cursorObj;
}

function updateCustomCursor(pointer, cursorObj, scene) {
  if (!cursorObj || !cursorObj.hammer) return;

  const isESP = window.espTracker && window.espTracker.mode === 'esp';

  let targetX = pointer ? pointer.x : 600;
  let targetY = pointer ? pointer.y : 400;

  if (isESP) {
    // If real ESP tracking data is streaming and detected, use ESP position
    if (window.espTracker.isConnected && window.espTracker.raw.isDetected) {
      targetX = window.espTracker.currentScreenPos.x;
      targetY = window.espTracker.currentScreenPos.y;
    } else {
      // In ESP mode while offline/testing on desktop, mouse drives the tracked position
      targetX = pointer ? pointer.x : window.espTracker.currentScreenPos.x;
      targetY = pointer ? pointer.y : window.espTracker.currentScreenPos.y;
      window.espTracker.currentScreenPos.x = targetX;
      window.espTracker.currentScreenPos.y = targetY;
    }
  }

  // Calculate movement velocity vector & angle
  const dx = targetX - cursorObj.lastX;
  const dy = targetY - cursorObj.lastY;
  cursorObj.lastX = targetX;
  cursorObj.lastY = targetY;

  // Exponential moving average for velocity
  cursorObj.vx = cursorObj.vx * 0.65 + dx * 0.35;
  cursorObj.vy = cursorObj.vy * 0.65 + dy * 0.35;

  const speed = Math.sqrt(cursorObj.vx * cursorObj.vx + cursorObj.vy * cursorObj.vy);

  // When moving, dynamically tilt the hammer into the direction of motion
  let targetTilt = 0;
  if (speed > 0.6) {
    // Moving right leans clockwise (+), moving left leans counter-clockwise (-)
    // Vertical velocity adds a slight forward/backward pitch
    targetTilt = Phaser.Math.Clamp(cursorObj.vx * 2.2 + cursorObj.vy * 0.35, -35, 35);
  }

  // Smoothly interpolate towards target tilt (spring back to 0 when stopped)
  cursorObj.tiltAngle += (targetTilt - cursorObj.tiltAngle) * 0.22;

  // Shadow is locked exactly onto the active tracking/pointer position
  cursorObj.shadow.x = targetX;
  cursorObj.shadow.y = targetY;

  // Hammer follows position plus dynamic slam offset and combined rotation
  cursorObj.hammer.x = targetX + cursorObj.offsetX;
  cursorObj.hammer.y = targetY + cursorObj.offsetY;
  cursorObj.hammer.angle = cursorObj.slamAngle + cursorObj.tiltAngle;
}

function triggerWhackAnimation(scene, cursorObj) {
  if (!cursorObj || !cursorObj.hammer) return;

  // Audio whack impact feedback
  if (window.espTracker) {
    window.espTracker.playWhackSound();
  }

  // Cancel any existing whack tween to prevent animation lock on spam
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
    slamAngle: -70,
    duration: 60,
    ease: 'Quad.easeOut',
    yoyo: true,
    hold: 25,
    onYoyo: () => {
      // Pulse shadow on ground impact
      cursorObj.shadow.setScale(1.25, 1.25);
      cursorObj.shadow.setAlpha(1.0);
    },
    onComplete: () => {
      cursorObj.offsetX = 0;
      cursorObj.offsetY = 0;
      cursorObj.slamAngle = 0;
      cursorObj.whackTween = null;
    }
  });

  cursorObj.shadowTween = scene.tweens.add({
    targets: cursorObj.shadow,
    scaleX: 1.0,
    scaleY: 1.0,
    alpha: 0.85,
    duration: 150,
    ease: 'Quad.easeOut',
    onComplete: () => {
      cursorObj.shadowTween = null;
    }
  });
}

function renderBackground(scene, levelConfig = null) {
  let backgroundKey = 'backyard'; // default
  
  if (levelConfig) {
    switch (levelConfig.level) {
      case 1:
        backgroundKey = 'backyard';
        break;
      case 2:
        backgroundKey = 'vegetable-patch';
        break;
      case 3:
        backgroundKey = 'grassy-meadow';
        break;
      case 4:
      case 5:
      case 6:
        backgroundKey = 'backyard'; // placeholder until othr background art has been created
        break;
      default:
        backgroundKey = 'backyard';
    }
  }
  
  const bg = scene.add.image(0, 0, backgroundKey).setOrigin(0, 0);
  bg.setDisplaySize(1200, 800);
  bg.setDepth(0);
  return bg;
}

// ----------------------------------------------------
// Button Helper
// ----------------------------------------------------
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

  // Dwell fill progress bar on button
  const dwellFill = scene.add.rectangle(-width / 2, 0, 0, height - 8, 0xffffff, 0.35);
  dwellFill.setOrigin(0, 0.5);
  dwellFill.setVisible(false);

  const label = scene.add.text(0, 0, text, {
    fontFamily: PIXEL_FONT,
    fontSize: options.fontSize || '22px',
    fontStyle: 'bold',
    color: isDisabled ? '#888888' : '#ffffff',
    align: 'center',
    stroke: '#000000',
    strokeThickness: 3
  }).setOrigin(0.5);

  container.add([shadow, bg, dwellFill, label]);

  const btnData = {
    container,
    bg,
    dwellFill,
    label,
    x,
    y,
    width,
    height,
    bgColor,
    hoverColor,
    onClick,
    isDisabled,
    dwellTime: 0,
    isHovered: false
  };

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

  // Register with scene for hands-free dwell detection
  scene.registeredButtons = scene.registeredButtons || [];
  scene.registeredButtons.push(btnData);

  container.btnData = btnData;
  return container;
}

function processSceneButtonDwell(scene, delta) {
  if (!scene.registeredButtons || !scene.cursor || !scene.cursor.shadow) return;

  // Only use dwell button selection when in ESP Body Tracking mode
  const isESPMode = window.espTracker && window.espTracker.mode === 'esp' && !scene.cursor.usingMouse;
  if (!isESPMode) {
    scene.registeredButtons.forEach(btn => {
      if (btn.dwellFill && btn.dwellFill.visible) {
        btn.dwellTime = 0;
        btn.dwellFill.width = 0;
        btn.dwellFill.setVisible(false);
      }
    });
    return;
  }

  const curX = scene.cursor.shadow.x;
  const curY = scene.cursor.shadow.y;

  scene.registeredButtons.forEach(btn => {
    if (btn.isDisabled || !btn.container.visible) {
      btn.dwellTime = 0;
      if (btn.dwellFill) btn.dwellFill.setVisible(false);
      return;
    }

    const halfW = btn.width / 2;
    const halfH = btn.height / 2;
    const isInside = (curX >= btn.x - halfW && curX <= btn.x + halfW &&
      curY >= btn.y - halfH && curY <= btn.y + halfH);

    if (isInside) {
      btn.isHovered = true;
      btn.bg.setFillStyle(btn.hoverColor);
      btn.dwellTime += delta;
      if (btn.dwellFill) {
        btn.dwellFill.setVisible(true);
        const progress = Math.min(1.0, btn.dwellTime / 900); // 900ms dwell activation
        btn.dwellFill.width = (btn.width - 8) * progress;
      }

      if (btn.dwellTime >= 900) {
        btn.dwellTime = 0;
        if (btn.dwellFill) {
          btn.dwellFill.width = 0;
          btn.dwellFill.setVisible(false);
        }
        triggerWhackAnimation(scene, scene.cursor);
        btn.onClick();
      }
    } else {
      if (btn.isHovered) {
        btn.isHovered = false;
        btn.bg.setFillStyle(btn.bgColor);
        btn.dwellTime = 0;
        if (btn.dwellFill) {
          btn.dwellFill.width = 0;
          btn.dwellFill.setVisible(false);
        }
      }
    }
  });
}

// ----------------------------------------------------
// Boot Scene - Asset Loading
// ----------------------------------------------------
class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.image('backyard', 'assets/backyard.png');
    this.load.image('vegetable-patch', 'assets/vegetable-patch.png');
    this.load.image('grassy-meadow', 'assets/grassy-meadow.png');
    this.load.image('hole', 'assets/hole.png');
    this.load.image('hammer', 'assets/hammer1.png');
    this.load.image('mole', 'assets/mole.png');
    this.load.image('whacked-mole', 'assets/whacked-mole.png');
    this.load.image('missed-mole', 'assets/missed-mole.png');
    this.load.image('rabbit', 'assets/rabbit.png');
    this.load.image('crying-rabbit', 'assets/crying-rabbit.png');
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
    this.registeredButtons = [];
    renderBackground(this, this.levelConfig);
    this.cursor = createCustomCursor(this);

    this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.35).setDepth(1);

    // Title Card with pixel border
    const titlePanel = this.add.container(600, 170).setDepth(2);
    const panelBg = this.add.rectangle(0, 0, 680, 130, 0x1e272e, 0.9);
    panelBg.setStrokeStyle(4, 0xf1c40f, 1);
    const panelShadow = this.add.rectangle(5, 5, 680, 130, 0x000000, 0.6);

    const title = this.add.text(0, -18, 'WHACK-A-MOLE', {
      fontFamily: PIXEL_FONT,
      fontSize: '54px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    const subtitle = this.add.text(0, 36, 'ENGG3000 | GROUP 2: LEGENDS', {
      fontFamily: PIXEL_FONT,
      fontSize: '20px',
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
    createPixelButton(this, 600, 360, 360, 65, '⭐ LEVELS MODE', () => {
      this.scene.start('LevelSelectScene');
    }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, fontSize: '24px' });

    createPixelButton(this, 600, 450, 360, 65, '⚡ ENDLESS MODE', () => {
      this.scene.start('GameScene', { mode: 'endless' });
    }, { bgColor: 0xd35400, hoverColor: 0xe67e22, borderColor: 0x7e3100, fontSize: '24px' });

    // Mode Toggle Button (ESP Tracker vs Mouse)
    const updateMenuModeBtn = () => {
      if (this.modeBtn && this.modeBtn.btnData && this.modeBtn.btnData.label) {
        this.modeBtn.btnData.label.setText(window.espTracker.getModeLabel());
      }
    };

    this.modeBtn = createPixelButton(this, 600, 540, 360, 55, window.espTracker.getModeLabel(), () => {
      window.espTracker.toggleMode();
      updateMenuModeBtn();
    }, { bgColor: 0x2980b9, hoverColor: 0x3498db, borderColor: 0x1a5276, fontSize: '18px' });

    this.modeChangeCb = () => updateMenuModeBtn();
    window.espTracker.on('modeChange', this.modeChangeCb);
    this.events.on('shutdown', () => {
      if (this.modeChangeCb) window.espTracker.off('modeChange', this.modeChangeCb);
    });

    // Tracker Status Hint Bar at bottom
    const progress = getGameProgress();
    const bestBox = this.add.container(840, 450).setDepth(3);
    const bestText = this.add.text(0, 0, `BEST: ${progress.endlessHighScore}`, {
      fontFamily: PIXEL_FONT,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
    const textBounds = bestText.getBounds();
    const bestBg = this.add.rectangle(-40, 0, textBounds.width + 100, textBounds.height + 20, 0x111111, 0.85);
    bestBg.setStrokeStyle(2, 0xffffff, 0.3);
    bestBox.add([bestBg, bestText]);

    this.input.on('pointerdown', () => {
      triggerWhackAnimation(this, this.cursor);
    });
  }

  update(time, delta) {
    if (window.espTracker) {
      window.espTracker.update(delta);
    }
    updateCustomCursor(this.input.activePointer, this.cursor, this);
    processSceneButtonDwell(this, delta);
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
    this.registeredButtons = [];
    renderBackground(this);
    this.cursor = createCustomCursor(this);

    this.add.rectangle(600, 400, 1200, 800, 0x000000, 0.5).setDepth(1);

    // Header
    const headerBox = this.add.container(600, 75).setDepth(2);
    const headerBg = this.add.rectangle(0, 0, 440, 56, 0x1e272e, 0.95);
    headerBg.setStrokeStyle(4, 0xf1c40f, 1);
    const headerTxt = this.add.text(0, 0, 'SELECT LEVEL', {
      fontFamily: PIXEL_FONT,
      fontSize: '32px',
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
    const startY = 230;
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

      // Card Dwell Fill
      const dwellFill = this.add.rectangle(-cardW / 2, 0, 0, cardH - 8, 0xffffff, 0.25);
      dwellFill.setOrigin(0, 0.5);
      dwellFill.setVisible(false);

      card.add([cardShadow, cardBg, dwellFill]);

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
        const targetTxt = this.add.text(0, -22, `TARGET: ${cfg.targetScore}  (${cfg.holes || 6} HOLES)`, {
          fontFamily: PIXEL_FONT,
          fontSize: '15px',
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

        // Register card for dwell navigation
        this.registeredButtons.push({
          container: card,
          bg: cardBg,
          dwellFill,
          x: cx,
          y: cy,
          width: cardW,
          height: cardH,
          bgColor: 0x1b281b,
          hoverColor: 0x27ae60,
          isDisabled: false,
          dwellTime: 0,
          isHovered: false,
          onClick: () => {
            this.scene.start('GameScene', { mode: 'level', levelIndex: idx });
          }
        });
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
    createPixelButton(this, 600, 715, 240, 52, '⬅ MAIN MENU', () => {
      this.scene.start('MenuScene');
    }, { bgColor: 0x555555, hoverColor: 0x777777, borderColor: 0x222222, fontSize: '18px' });

    this.input.on('pointerdown', () => {
      triggerWhackAnimation(this, this.cursor);
    });
  }

  update(time, delta) {
    if (window.espTracker) {
      window.espTracker.update(delta);
    }
    updateCustomCursor(this.input.activePointer, this.cursor, this);
    processSceneButtonDwell(this, delta);
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

    // Dead-Zone safety alert & count-in state
    this.isDeadZonePaused = false;
    this.isCountingDown = false;
    this.countInSeconds = 3;
    this.deadZoneModalContainer = null;
    this.countInModalContainer = null;

    // Hands-free dwell hit accumulator
    this.dwellTime = 0;
    this.dwellTargetMole = null;

    // 1-minute time limit for Level mode
    this.levelTimeLeft = 60;
    this.levelTimerEvent = null;
    this.rabbitTimerEvent = null;

    this.holes = [];
    this.moles = [];
    this.rabbit = null;
    this.activeRabbit = false;
    this.rabbitHoleIndex = -1;
    this.timerTween = null;
    this.pauseModalContainer = null;
    this.registeredButtons = [];
  }

  create() {
    this.registeredButtons = [];
    renderBackground(this, this.levelConfig);
    this.cursor = createCustomCursor(this);

    // Dwell Progress Ring Graphic
    this.dwellGraphics = this.add.graphics().setDepth(15);

    // Holes Setup
    const holeCount = (this.gameMode === 'level' && this.levelConfig && this.levelConfig.holes)
      ? this.levelConfig.holes
      : 6;
    const holePositions = getHolePositions(holeCount);

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

    this.rabbit = this.add.image(0, 0, 'rabbit');
    this.rabbit.setScale(3);
    this.rabbit.setVisible(false);
    this.rabbit.setDepth(6);

    // Create Mole Timer Bar
    this.timerBar = this.createMoleTimerBar();
    this.timerBar.container.setVisible(false);

    // Setup Uncluttered Pixel-styled HUD
    this.setupHUD();

    // Level 60s Countdown Timer
    if (this.gameMode === 'level') {
      this.levelTimerEvent = this.time.addEvent({
        delay: 1000,
        repeat: 59,
        callback: () => {
          if (!this.isPaused && !this.isDeadZonePaused && !this.isCountingDown) {
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

    // Spacebar fallback for manual whacking
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.canWhack && !this.gameOver && !this.gameComplete && !this.isPaused && !this.isDeadZonePaused && !this.isCountingDown) {
        this.whackMole();
      }
    });

    // Pointer Input for Whacking
    this.input.on('pointerdown', () => {
      if (this.canWhack && !this.gameOver && !this.gameComplete && !this.isPaused && !this.isDeadZonePaused && !this.isCountingDown) {
        this.whackMole();
      }
    });

    // Start mole spawning after 1 second
    this.time.delayedCall(1000, () => this.activateRandomMole());

    // A rabbit appears independently every 10 seconds
    this.rabbitTimerEvent = this.time.addEvent({
      delay: 10000,
      loop: true,
      callback: () => this.activateRandomRabbit()
    });
  }

  update(time, delta) {
    if (window.espTracker) {
      window.espTracker.update(delta);
    }

    updateCustomCursor(this.input.activePointer, this.cursor, this);
    processSceneButtonDwell(this, delta);

    // ----------------------------------------------------
    // Dead-Zone Safety Check & State Machine
    // ----------------------------------------------------
    if (window.espTracker && window.espTracker.mode === 'esp') {
      const isDeadZone = window.espTracker.inDeadZone;

      if (isDeadZone && !this.isDeadZonePaused && !this.gameOver && !this.gameComplete) {
        this.triggerDeadZonePause();
      } else if (!isDeadZone && this.isDeadZonePaused && !this.isCountingDown) {
        this.triggerDeadZoneResumeCountdown();
      }
    }

    // ----------------------------------------------------
    // Hands-Free Dwell Whacking on Active Mole (ESP Mode only)
    // ----------------------------------------------------
    const isESPMode = window.espTracker && window.espTracker.mode === 'esp';
    if (isESPMode && (this.activeMole || this.activeRabbit) && this.canWhack && !this.isPaused && !this.isDeadZonePaused && !this.isCountingDown && !this.gameOver && !this.gameComplete) {
      const strikeX = this.cursor.shadow.x;
      const strikeY = this.cursor.shadow.y;
      const targets = [];
      if (this.activeMole) targets.push(this.activeMole);
      if (this.activeRabbit) targets.push(this.rabbit);
      const target = targets
        .map(candidate => ({ candidate, distance: Phaser.Math.Distance.Between(strikeX, strikeY, candidate.x, candidate.y) }))
        .filter(item => item.distance < 85)
        .sort((first, second) => first.distance - second.distance)[0];

      if (target) {
        if (this.dwellTargetMole !== target.candidate) {
          this.dwellTime = 0;
          this.clearDwellRing();
        }
        this.dwellTime += delta;
        this.dwellTargetMole = target.candidate;

        if (this.dwellTime >= 240) {
          // Ring completed: IMMEDIATELY wipe ring before triggering whack
          this.clearDwellRing();
          this.dwellTime = 0;
          this.dwellTargetMole = null;
          this.whackMole();
        } else {
          // Draw radial progress arc around mole
          const progress = Math.min(1.0, this.dwellTime / 240);
          this.drawDwellRing(target.candidate.x, target.candidate.y, progress);
        }
      } else {
        if (this.dwellTime > 0) {
          this.dwellTime = 0;
          this.clearDwellRing();
        }
      }
    } else {
      if (this.dwellTime > 0) {
        this.dwellTime = 0;
      }
      this.clearDwellRing();
    }
  }

  drawDwellRing(x, y, progress) {
    this.dwellGraphics.clear();
    if (progress <= 0) return;

    // Background circle
    this.dwellGraphics.lineStyle(6, 0x000000, 0.4);
    this.dwellGraphics.beginPath();
    this.dwellGraphics.arc(x, y, 54, 0, Phaser.Math.PI2);
    this.dwellGraphics.strokePath();

    // Active progress arc
    this.dwellGraphics.lineStyle(6, 0xf1c40f, 0.95);
    this.dwellGraphics.beginPath();
    const startAngle = Phaser.Math.DegToRad(-90);
    const endAngle = startAngle + Phaser.Math.DegToRad(360 * progress);
    this.dwellGraphics.arc(x, y, 54, startAngle, endAngle, false);
    this.dwellGraphics.strokePath();
  }

  clearDwellRing() {
    this.dwellGraphics.clear();
  }

  // ----------------------------------------------------
  // Dead-Zone Safety Alert (Buzzer + Visual Warning + Pause)
  // ----------------------------------------------------
  triggerDeadZonePause() {
    if (this.isDeadZonePaused) return;
    this.isDeadZonePaused = true;

    // Pause timers & animations
    if (this.levelTimerEvent) this.levelTimerEvent.paused = true;
    if (this.timerTween) this.timerTween.pause();

    // Create Warning Overlay
    this.deadZoneModalContainer = this.add.container(600, 400).setDepth(80);

    // Flashing red border / overlay
    const overlay = this.add.rectangle(0, 0, 1200, 800, 0x8b0000, 0.65);
    const border = this.add.rectangle(0, 0, 1160, 760);
    border.setStrokeStyle(10, 0xff0000, 1);

    const bannerBg = this.add.rectangle(0, 0, 860, 160, 0x111111, 0.95);
    bannerBg.setStrokeStyle(5, 0xe74c3c, 1);

    const iconTxt = this.add.text(0, -45, '⚠️ STAND BACK! ⚠️', {
      fontFamily: PIXEL_FONT,
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#e74c3c',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);

    const subTxt = this.add.text(0, 25, 'PLEASE STEP BACK INTO THE PLAY AREA TO RESUME', {
      fontFamily: PIXEL_FONT,
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.deadZoneModalContainer.add([overlay, border, bannerBg, iconTxt, subTxt]);

    // Flashing pulsing effect
    this.tweens.add({
      targets: [overlay, border],
      alpha: 0.25,
      duration: 350,
      yoyo: true,
      repeat: -1
    });
  }

  // ----------------------------------------------------
  // Count-in Upon Stepping Back Into Play Area (3.. 2.. 1.. GO!)
  // ----------------------------------------------------
  triggerDeadZoneResumeCountdown() {
    if (this.isCountingDown) return;
    this.isCountingDown = true;

    // Destroy dead zone warning modal
    if (this.deadZoneModalContainer) {
      this.deadZoneModalContainer.destroy();
      this.deadZoneModalContainer = null;
    }

    // Create Count-in Modal
    this.countInModalContainer = this.add.container(600, 400).setDepth(80);

    const overlay = this.add.rectangle(0, 0, 1200, 800, 0x000000, 0.45);
    const countCard = this.add.rectangle(0, 0, 360, 200, 0x1e272e, 0.95);
    countCard.setStrokeStyle(4, 0x2ecc71, 1);

    const readyTxt = this.add.text(0, -50, 'READY...', {
      fontFamily: PIXEL_FONT,
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    const numberTxt = this.add.text(0, 20, '3', {
      fontFamily: PIXEL_FONT,
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#2ecc71',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.countInModalContainer.add([overlay, countCard, readyTxt, numberTxt]);

    let step = 3;
    const countdownEvent = this.time.addEvent({
      delay: 800,
      repeat: 3,
      callback: () => {
        // If player stepped back into dead zone during count-in, cancel and re-trigger warning
        if (window.espTracker && window.espTracker.inDeadZone) {
          countdownEvent.remove();
          if (this.countInModalContainer) {
            this.countInModalContainer.destroy();
            this.countInModalContainer = null;
          }
          this.isCountingDown = false;
          this.triggerDeadZonePause();
          return;
        }

        step--;
        if (step === 2) {
          numberTxt.setText('2');
          numberTxt.setScale(1.4);
          this.tweens.add({ targets: numberTxt, scale: 1.0, duration: 250 });
        } else if (step === 1) {
          numberTxt.setText('1');
          numberTxt.setScale(1.4);
          this.tweens.add({ targets: numberTxt, scale: 1.0, duration: 250 });
        } else if (step === 0) {
          readyTxt.setText('RESUMING!');
          numberTxt.setText('GO!');
          numberTxt.setColor('#f1c40f');
          numberTxt.setScale(1.5);
          this.tweens.add({ targets: numberTxt, scale: 1.0, duration: 250 });
        } else {
          // Finish Count-in and unpause
          if (this.countInModalContainer) {
            this.countInModalContainer.destroy();
            this.countInModalContainer = null;
          }
          this.isCountingDown = false;
          this.isDeadZonePaused = false;

          // Resume game timers & mole tweens
          if (this.levelTimerEvent && !this.isPaused) this.levelTimerEvent.paused = false;
          if (this.timerTween && !this.isPaused) {
            this.timerTween.resume();
          }

          // If no active mole is present, restart the mole spawn sequence
          if (!this.activeMole && !this.isPaused && !this.gameOver && !this.gameComplete) {
            const spawnDelay = this.getMoleSpawnDelay();
            this.time.delayedCall(spawnDelay, () => this.activateRandomMole());
          }
        }
      }
    });
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
    const barBg = this.add.rectangle(600, 36, 1160, 52, 0x1e272e, 0.62);
    barBg.setStrokeStyle(4, 0x111111, 0.6);
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

    // Register pause badge for dwell interaction
    this.registeredButtons.push({
      container: pauseBadge,
      bg: pauseBg,
      dwellFill: { setVisible: () => { }, width: 0 },
      x: 1110,
      y: 36,
      width: 90,
      height: 34,
      bgColor: 0x333333,
      hoverColor: 0x555555,
      isDisabled: false,
      dwellTime: 0,
      isHovered: false,
      onClick: () => this.togglePause()
    });
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

  // ----------------------------------------------------
  // Pause Menu with Integrated ESP32 Tracker Status Panel
  // ----------------------------------------------------
  pauseGame() {
    this.isPaused = true;
    if (this.levelTimerEvent) this.levelTimerEvent.paused = true;
    if (this.timerTween) this.timerTween.pause();

    // Create Pause Modal
    this.pauseModalContainer = this.add.container(600, 400).setDepth(60);

    const overlay = this.add.rectangle(0, 0, 1200, 800, 0x000000, 0.75);
    overlay.setInteractive(); // Blocks clicks to background

    const panelBg = this.add.rectangle(0, 0, 680, 520, 0x1e272e, 0.98);
    panelBg.setStrokeStyle(4, 0xf1c40f, 1);
    const panelShadow = this.add.rectangle(5, 5, 680, 520, 0x000000, 0.6);

    const title = this.add.text(0, -215, 'GAME PAUSED', {
      fontFamily: PIXEL_FONT,
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#f1c40f',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5);

    // ESP32 Status Sub-Panel
    const isESP = window.espTracker && window.espTracker.mode === 'esp';
    const isConn = window.espTracker && window.espTracker.isConnected;
    const statusColor = isConn ? '#2ecc71' : '#e74c3c';
    const statusText = isConn ? `🟢 ESP CONNECTED (${window.espTracker.host})` : `🔴 ESP OFFLINE (${window.espTracker.host})`;

    const trackerBox = this.add.rectangle(0, -110, 620, 110, 0x111111, 0.9);
    trackerBox.setStrokeStyle(2, 0x555555, 1);

    const trackerTitle = this.add.text(0, -145, '📡 ESP32 ULTRASONIC TRACKING STATUS', {
      fontFamily: PIXEL_FONT,
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#bdc3c7'
    }).setOrigin(0.5);

    const connLabel = this.add.text(-280, -118, statusText, {
      fontFamily: PIXEL_FONT,
      fontSize: '14px',
      fontStyle: 'bold',
      color: statusColor
    });

    const raw = window.espTracker ? window.espTracker.raw : { xCm: 0, yCm: 0, confidence: 0, secOnline: false };
    const teleLabel = this.add.text(-280, -90,
      `Pos: (${raw.xCm.toFixed(0)}cm, ${raw.yCm.toFixed(0)}cm) | Conf: ${(raw.confidence * 100).toFixed(0)}% | Sec Node: ${raw.secOnline ? 'ONLINE' : 'OFFLINE'}`, {
      fontFamily: PIXEL_FONT,
      fontSize: '13px',
      color: '#f1c40f'
    });

    this.pauseModalContainer.add([overlay, panelShadow, panelBg, title, trackerBox, trackerTitle, connLabel, teleLabel]);

    // Mode Toggle Button inside Pause Menu
    const updatePauseModeBtn = () => {
      if (modeBtn && modeBtn.btnData && modeBtn.btnData.label) {
        modeBtn.btnData.label.setText(window.espTracker.getModeLabel());
      }
    };

    const modeBtn = createPixelButton(this, 600 - 150, -35 + 400, 290, 44, window.espTracker.getModeLabel(), () => {
      window.espTracker.toggleMode();
      updatePauseModeBtn();
    }, { bgColor: 0x2980b9, hoverColor: 0x3498db, borderColor: 0x1a5276, fontSize: '15px', depth: 65 });

    // Mirror X Toggle Button
    const mirrorText = window.espTracker && window.espTracker.mirrorX ? 'MIRROR X: ON 🪞' : 'MIRROR X: OFF';
    const mirrorBtn = createPixelButton(this, 600 + 150, -35 + 400, 260, 44, mirrorText, () => {
      const nextMirror = !(window.espTracker.mirrorX);
      window.espTracker.setMirrorX(nextMirror);
      mirrorBtn.btnData.label.setText(nextMirror ? 'MIRROR X: ON 🪞' : 'MIRROR X: OFF');
    }, { bgColor: 0x8e44ad, hoverColor: 0x9b59b6, borderColor: 0x5b2c6f, fontSize: '15px', depth: 65 });

    // Resume Button
    const resumeBtn = createPixelButton(this, 600, 30 + 400, 320, 50, 'RESUME GAME ▶', () => {
      this.resumeGame();
    }, { bgColor: 0x27ae60, hoverColor: 0x2ecc71, borderColor: 0x145a32, depth: 65 });

    // Restart Button
    const restartBtn = createPixelButton(this, 600, 95 + 400, 320, 50, 'RESTART LEVEL ↺', () => {
      this.scene.start('GameScene', { mode: this.gameMode, levelIndex: this.levelIndex });
    }, { bgColor: 0xd35400, hoverColor: 0xe67e22, borderColor: 0x7e3100, depth: 65 });

    // Exit to Menu Button
    const exitBtn = createPixelButton(this, 600, 160 + 400, 320, 50, this.gameMode === 'level' ? 'LEVEL SELECT ☰' : 'MAIN MENU ☰', () => {
      if (this.gameMode === 'level') {
        this.scene.start('LevelSelectScene');
      } else {
        this.scene.start('MenuScene');
      }
    }, { bgColor: 0x7f8c8d, hoverColor: 0x95a5a6, borderColor: 0x333333, depth: 65 });

    this.pauseModalContainer.buttons = [modeBtn, mirrorBtn, resumeBtn, restartBtn, exitBtn];
  }

  resumeGame() {
    this.isPaused = false;
    if (this.levelTimerEvent && !this.isDeadZonePaused && !this.isCountingDown) this.levelTimerEvent.paused = false;
    if (this.timerTween && !this.isDeadZonePaused && !this.isCountingDown) {
      this.timerTween.resume();
    }

    if (!this.activeMole && !this.isDeadZonePaused && !this.isCountingDown && !this.gameOver && !this.gameComplete) {
      const spawnDelay = this.getMoleSpawnDelay();
      this.time.delayedCall(spawnDelay, () => this.activateRandomMole());
    }

    if (this.pauseModalContainer) {
      if (this.pauseModalContainer.buttons) {
        this.pauseModalContainer.buttons.forEach(btn => {
          // Remove from registeredButtons
          if (btn.btnData) {
            this.registeredButtons = this.registeredButtons.filter(b => b !== btn.btnData);
          }
          btn.destroy();
        });
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
    if (this.activeMole || this.gameOver || this.gameComplete || this.isPaused || this.isDeadZonePaused || this.isCountingDown) {
      return;
    }

    const availableHoleIndexes = this.moles
      .map((mole, index) => index)
      .filter(index => !this.activeRabbit || index !== this.rabbitHoleIndex);

    if (availableHoleIndexes.length === 0) return;

    const randomIndex = Phaser.Utils.Array.GetRandom(availableHoleIndexes);
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
    width: 0 ,
    duration: moleDuration,
    ease: 'Linear',

    onUpdate: (tween) => {
      // Get the percentage of time that has passed
      const progress = tween.progress;

      // GREEN -> YELLOW during the first half
      if (progress < 0.5) {
        const colourProgress = progress / 0.5;

        const red = Math.round(85 + (255 - 85) * colourProgress);
        const green = 204;
        const blue = Math.round(85 - (85 * colourProgress));

        const colour = (red << 16) | (green << 8) | blue;

        this.timerBar.bar.setFillStyle(colour);

      // YELLOW -> RED during the second half
      } else {
        const colourProgress = (progress - 0.5) / 0.5;

       const red = 255;
      const green = Math.round(204 - (204 * colourProgress));
       const blue = 0;

       const colour = (red << 16) | (green << 8) | blue;

       this.timerBar.bar.setFillStyle(colour);
     }
    // Shake mole during the final 0.7 seconds
     if (tween.progress >= 0.77 && !selectedMole.isShaking) {
       selectedMole.isShaking = true;

       this.tweens.add({
         targets: selectedMole,
         x: hole.x + 8,
         duration: 60,
         yoyo: true,
         repeat: -1,
         ease: 'Sine.easeInOut'
       });
     }
    },

    onComplete: () => {
      this.timerTween = null;

      // Stop mole shaking
      this.tweens.killTweensOf(selectedMole);
      selectedMole.x = hole.x;
      selectedMole.isShaking = false;  

      // Reset timer colour for the next mole
      this.timerBar.bar.setFillStyle(0x55cc55);

     if (
        this.activeMole === selectedMole &&
        !this.gameOver &&
       !this.gameComplete
     ) {
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

  activateRandomRabbit() {
    if (!this.rabbit || this.activeRabbit || this.gameOver || this.gameComplete || this.isPaused || this.isDeadZonePaused || this.isCountingDown) {
      return;
    }

    const availableHoleIndexes = this.holes
      .map((hole, index) => index)
      .filter(index => this.moles[index] !== this.activeMole);

    if (availableHoleIndexes.length === 0) return;

    const holeIndex = Phaser.Utils.Array.GetRandom(availableHoleIndexes);
    const hole = this.holes[holeIndex];
    this.activeRabbit = true;
    this.rabbitHoleIndex = holeIndex;
    this.rabbit.x = hole.x;
    this.rabbit.y = hole.y + 80;
    this.rabbit.setVisible(true);

    this.tweens.add({
      targets: this.rabbit,
      y: hole.y - 25, //rabbit position when dormant after popping up
      duration: 250,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(2500, () => {
          if (!this.rabbit || !this.activeRabbit) return;

          this.tweens.add({
            targets: this.rabbit,
            y: hole.y + 80,
            duration: 260,
            ease: 'Back.easeIn',
            onComplete: () => {
              this.rabbit.setVisible(false);
              this.activeRabbit = false;
              this.rabbitHoleIndex = -1;
            }
          });
        });
      }
    });
  }

  deactivateMole(mole, wasWhacked = false) {
    // Immediately clear activeMole and dwell ring so it can never be retargeted while falling
    this.activeMole = null;
    this.clearDwellRing();
    this.dwellTime = 0;
    this.dwellTargetMole = null;

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

        if (!this.gameOver && !this.gameComplete && !this.isPaused && !this.isDeadZonePaused && !this.isCountingDown) {
          const spawnDelay = this.getMoleSpawnDelay();
          this.time.delayedCall(spawnDelay, () => this.activateRandomMole());
        }
      }
    });
  }

  whackMole() {
    triggerWhackAnimation(this, this.cursor);

    const strikeX = this.cursor.shadow.x;
    const strikeY = this.cursor.shadow.y;

    if (this.activeRabbit) {
      const rabbitDist = Phaser.Math.Distance.Between(strikeX, strikeY, this.rabbit.x, this.rabbit.y);
      if (rabbitDist < 85) {
        this.rabbit.setTexture('crying-rabbit');
        this.activeRabbit = false;
        this.rabbitHoleIndex = -1;
        this.handleRabbitWhacked();
        return;
      }
    }

    const mole = this.activeMole;
    if (!mole) return;

    const dist = Phaser.Math.Distance.Between(strikeX, strikeY, mole.x, mole.y);

    if (dist < 85) {
      // Immediately clear activeMole and wipe dwell ring before starting retract tween
      this.activeMole = null;
      this.clearDwellRing();
      this.dwellTime = 0;
      this.dwellTargetMole = null;

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

  handleRabbitWhacked() {
    //this.missedMoles++;
    this.updateHUD();
    this.canWhack = false;

    if (this.rabbitTimerEvent) this.rabbitTimerEvent.remove();
    if (this.levelTimerEvent) this.levelTimerEvent.remove();
    if (this.timerTween) this.timerTween.stop();
    this.timerBar.container.setVisible(false);

    this.time.delayedCall(500, () => {
      if (this.gameMode === 'level') {
        this.handleLevelLostLives('RABBIT WHACKED');
      } else {
        this.handleEndlessGameOver('RABBIT WHACKED');
      }
    });
  }

  handleLevelLostLives(reason = 'ALL 3 LIVES LOST') {
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
      `LEVEL: ${this.levelConfig.name.toUpperCase()}\nSCORE: ${this.score} / TARGET: ${this.levelConfig.targetScore}\nTIME LEFT: ${this.levelTimeLeft}s\n\n${reason}`, {
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

  handleEndlessGameOver(reason = null) {
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

    const highTxt = this.add.text(0, 15, reason || (isNewHigh ? '🏆 NEW HIGH SCORE!' : `ENDLESS BEST: ${progress.endlessHighScore}`), {
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
  render: {
    pixelArt: true,
    antialias: false,
    powerPreference: 'high-performance'
  },
  scene: [BootScene, MenuScene, LevelSelectScene, GameScene]
};

const game = new Phaser.Game(config);
