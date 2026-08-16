//all grass, big hles and moles and hammer blah game2.0 vers

const gameState = {
    score: 0,
    holes: [],
    moles: [],
    hammer: null,
    activeMole: null,

    timerBar: null,
    timerTween: null,
    moleTimeout: null,

    timer: 0,
    moleTime: 5000, //5 seconds for each mole
    canWhack: true,
    missedMoles: 0,
    maxMissedMoles: 3, //3 moles missed = game over

    gameOver: false
};

function preload () {
	//images (vfx, sprites, etc)
  this.load.image('background', 'assets/background.png');
  this.load.image('hole', 'assets/hole.png');
  this.load.image('hammer', 'assets/hammer1.png');
  this.load.image('mole', 'assets/mole.png'); // normal mole image (just popped up)
  this.load.image('whacked-mole', 'assets/whacked-mole.png'); // whacked angry mole
  this.load.image('missed-mole', 'assets/missed-mole.png'); // missed mole with stuck out tongue
}

function create () {
  setBackground(this);
  this.input.setDefaultCursor('none'); //hide browser cursor on game screen
  this.input.on('pointerdown', () => {
    if (gameState.canWhack) {
      whackMole(this);
    }
  });

  CenterX = config.width / 2; // 600
  CenterY = config.height / 2; // 400
  gameState.scoreText = this.add.text(CenterX-50, 750, 'Score: 0', { fontSize: '30px', fill: '#000' })
  
  //holes setup
  const holePositions = [
    { x: CenterX, y: CenterY-150},
    { x: CenterX, y: CenterY+150},
    { x: CenterX-400, y: CenterY-150},
    { x: CenterX-400, y: CenterY+150},
    { x: CenterX+400, y: CenterY-150},
    { x: CenterX+400, y: CenterY+150}
  ];

  holePositions.forEach(pos => {
    const hole = this.add.image(pos.x, pos.y-80, 'hole');
    hole.setDepth(5); //ensure holes are below moles and hammer
    hole.setScale(4);
    gameState.holes.push(hole);
  });

 gameState.hammer = createHammer(this);

 //mole setup
 createMoles(this);
 gameState.timerBar = createTimerBar(this);
 gameState.timerBar.container.setVisible(false);
 this.time.delayedCall(1000, () => activateRandomMole(this)); //activate a mole after 1 second
}

function update () { 
  //hammer on cursor - will be replaced by ultrasonic sensor positions
  gameState.hammer.x = this.input.activePointer.x;
  gameState.hammer.y = this.input.activePointer.y;
}

function setBackground(scene){
  const background = scene.add.image(0, 0, 'background').setOrigin(0,0);
  background.setDepth(0); //bg is behind everything
  background.setDisplaySize(config.width, config.height);
  return background;
}

function showGameOver(scene){
  if(gameState.gameOver){
    return; //gameover can only be called once
  }
  gameState.gameOver = true;
  gameState.canWhack = false;

  if(gameState.timerTween){ //stop timers
    gameState.timerTween.stop();
    gameState.timerTween = null;
  }
  if(gameState.timerBar){
    gameState.timerBar.container.setVisible(false);
  }

  //basic GAME OVER text for now - will design better later
  const overlay = scene.add.rectangle(600, 400, 1200, 800, 0x000, 0.65);
  overlay.setDepth(20);
  const gameOverText = scene.add.text(600,300,'GAME OVER!', {font:'bold 72px sans-serif', fill: '#fff'});
  gameOverText.setOrigin(0.5);
  gameOverText.setDepth(21); // appear over everything
  const finalScoreText = scene.add.text(600, 400, `Score: ${gameState.score}`,{font: '36px sans-serif',fill: '#fff'});
  finalScoreText.setOrigin(0.5);
  finalScoreText.setDepth(21);
  game
}

function createTimerBar(scene) {
  const background = scene.add.rectangle(0,0,100,12,0xf4f0f0);
  const bar = scene.add.rectangle(0,0,96, 8,0x55cc55);
  const timer = scene.add.container(0,0);
  timer.add([background, bar]);
  timer.setDepth(9); //ensure timer is above holes and moles but below hammer
  return {container:timer, bar:bar, maxWidth:96}; //return the timer container, bar, and max width for scaling
}

function createHammer(scene) {
  const hammer = scene.add.image(0, 0, 'hammer');
  hammer.setScale(10); //scale hammer image to desired size
  hammer.setOrigin(0.5, 0.5); //set origin to center of the image
  hammer.setDepth(10); //ensure hammer is always on top of other game objects
  return hammer;
}

//Mole creation
function createMoles(scene) {
  gameState.holes.forEach(hole => {
    //create mole for each hole
    const mole = scene.add.image(hole.x, hole.y+80, 'mole');
    mole.setScale(4);
    mole.setVisible(false); //hidden until it has been selected via activateRandomMole
    mole.setDepth(6); //ensure mole is above holes but below hammer
    //mole starts lower down and will pop up when activated
    gameState.moles.push(mole); //store reference to the mole
  });
}

function activateRandomMole(scene) {
  //dont activate a new mole if one is already active
  if (gameState.activeMole) {
    return;
  }

  //random mole selection
  const randomMoleIndex = Phaser.Math.Between(0, gameState.moles.length - 1);
  const selectedMole = gameState.moles[randomMoleIndex];
  selectedMole.setTexture('mole');
  //animate mole popping up
  const hole = gameState.holes[randomMoleIndex];
  gameState.activeMole = selectedMole;
  selectedMole.x = hole.x;
  selectedMole.y = hole.y+80;
  selectedMole.setVisible(true); 
  //timerrrrrrr reste
  if(gameState.timerTween) {
    gameState.timerTween.stop(); //stop any existing timer tween
    gameState.timerTween = null; //reset timer tween reference
  }
  gameState.timerBar.bar.width = gameState.timerBar.maxWidth; //reset timer bar width
  gameState.timerBar.container.setVisible(true); //show timer bar
  gameState.timerBar.container.x = hole.x;
  gameState.timerBar.container.y = hole.y - 60; //position timer bar above the mole
  //start time
  gameState.timerTween = scene.tweens.add({//animate mole popping up
    targets: gameState.timerBar.bar,
    width: 0, //decrease width to 0 over time
    duration: gameState.moleTime,
    ease: "Linear",
    onComplete: () => {
      gameState.timerTween = null; //reset timer tween reference
      //only decativeate mole if it is still the active mole (it might have been whacked)
      if (gameState.activeMole === selectedMole) {
        selectedMole.setTexture('missed-mole');
        gameState.missedMoles++; 
        deactivateMole(scene, selectedMole);
       if(gameState.missedMoles >= gameState.maxMissedMoles){
        showGameOver(scene);
       }
    }
   }
  });

  scene.tweens.add({//animate mole popping up
    targets: selectedMole,
    y: hole.y - 5, //move mole up
    duration: 300,
    ease: "Back.easeOut",
    onComplete: () => {
      //mole will stay up for 3 seconds (same as timer) before going down
      scene.time.delayedCall(gameState.moleTime, () => {
        if(gameState.activeMole === selectedMole) {
          deactivateMole(scene, selectedMole);
        }
      });
    }
  });
}

function deactivateMole(scene, mole) {
  if (!gameState.activeMole) { //no active mole to deactivate
    return;
  }
  //stop time
  if(gameState.timerTween) {
    gameState.timerTween.stop(); //stop any existing timer tween
    gameState.timerTween = null; //reset timer tween reference
  }
  gameState.timerBar.container.setVisible(false); //hide timer bar
  gameState.timerBar.bar.width = gameState.timerBar.maxWidth; //reset timer bar width
  //move mole down
  const index = gameState.moles.indexOf(mole);
  if (index === -1) { //mole not found in the array
    return;
  }
  const hole = gameState.holes[index];
  scene.tweens.add({
    targets: mole,
    y: hole.y+80, //move mole down
    duration: 300,
    ease: "Back.easeIn",
    onComplete: () => {
      mole.setVisible(false); //mole doesnt appear over hole after going down
      if (gameState.activeMole === mole) {
        gameState.activeMole = null; //reset active mole reference
      }
      if(gameState.missedMoles < gameState.maxMissedMoles){
        scene.time.delayedCall(1000, ()=> activateRandomMole(scene)); //IF game is NOT over, activate manother mole after 1 sec
      }
    }
  });
}

//whack mole game logic
function whackMole(scene) {
  const mole = gameState.activeMole;

  scene.tweens.add({
    targets: gameState.hammer,
    angle: -40,
    duration: 80,
    yoyo: true,
  });

  if (!mole) { //no active mole to whack
    return;
  }
  const hammerX = gameState.hammer.x;
  const hammerY = gameState.hammer.y;
  const distance = Phaser.Math.Distance.Between(hammerX, hammerY, mole.x, mole.y);
  if (distance < 80) { //if hammer is close enough to the mole
    mole.setTexture('whacked-mole');
    gameState.score += 1; //increase score
    gameState.scoreText.setText('Score: ' + gameState.score); //update score text
    deactivateMole(scene, mole); //deactivate the mole
  }
}

const config = {
  type: Phaser.AUTO, //detects if the browser supports webGL or canvas and uses the best option; may need to update 
  width: 1200,
  height: 800,
  backgroundColor: "#93da60",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
};

const game = new Phaser.Game(config)
