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
    moleTime: 3000, //3 seconds for each mole
    canWhack: true,
    //missedMoles: 0,
    //maxMissedMoles: 3
};

const Mole_Active_Y = -100;

function preload () {
	//images n shi
  this.load.image('hammer', 'assets/hammer.png');
}

function create () {
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
    const hole = this.add.ellipse(pos.x, pos.y, 200, 150, 0x222);
    hole.setDepth(5); //ensure holes are below moles and hammer
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
  hammer.setScale(12); //scale hammer image to desired size
  hammer.setOrigin(0.5, 0.5); //set origin to center of the image
  hammer.setDepth(10); //ensure hammer is always on top of other game objects
  hammer.setPipeline('TextureTintPipeline'); //enable tinting for the hammer image
  hammer.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); //set filter mode to nearest for pixelated effect
  return hammer;
}

//MOLLLLLLEEEEEEEEEE
function createMoles(scene) {
  gameState.holes.forEach(hole => {
    //create mole for each hole
    const mole = scene.add.container(hole.x, hole.y);
    //mole body
    const moleBody = scene.add.rectangle(0, 0, 100, 120, 0x964B00);
    //const moleHead = scene.add.ellipse(0, -24, 65, 70, 0x964B00);
    const moleEyeLeft = scene.add.ellipse(-25, -15, 20, 20, 0x00);
    const moleEyeRight = scene.add.ellipse(25, -15, 20, 20, 0x000);
    const moleNose = scene.add.ellipse(0, 15, 25, 20, 0xecb8b8);
    mole.add([moleBody, moleEyeLeft, moleEyeRight, moleNose]);
  
  mole.setDepth(4); //ensure mole is above holes but below hammer
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
  //animate mole popping up
  const hole = gameState.holes[randomMoleIndex];
  gameState.activeMole = selectedMole;
  //timerrrrrrr reste
  if(gameState.timerTween) {
    gameState.timerTween.stop(); //stop any existing timer tween
    gameState.timerTween = null; //reset timer tween reference
  }
  gameState.timerBar.bar.width = gameState.timerBar.maxWidth; //reset timer bar width
  gameState.timerBar.container.setVisible(true); //show timer bar
  gameState.timerBar.container.x = hole.x;
  gameState.timerBar.container.y = hole.y - 170; //position timer bar above the mole
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
        deactivateMole(scene, selectedMole);
      }
    }
  });

  scene.tweens.add({//animate mole popping up
    targets: selectedMole,
    y: hole.y + Mole_Active_Y, //move mole up
    duration: 300,
    ease: "Back.easeOut",
    onComplete: () => {
      //mole will stay up for 3 seconds (same as timer) before going down
      scene.time.delayedCall(3000, () => {
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
    y: hole.y, //move mole down
    duration: 300,
    ease: "Back.easeIn",
    onComplete: () => {
      if (gameState.activeMole === mole) {
        gameState.activeMole = null; //reset active mole reference
        scene.time.delayedCall(1000, () => activateRandomMole(scene)); //activate a new mole after 1 second
      }
    }
  });
}

//whack mole game logic
function whackMole(scene) {
  const mole = gameState.activeMole;

  scene.tweens.add({
    targets: gameState.hammer,
    angle: -35,
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
    gameState.score += 1; //increase score
    gameState.scoreText.setText('Score: ' + gameState.score); //update score text
    deactivateMole(scene, mole); //deactivate the mole
  }
}

const config = {
  type: Phaser.AUTO, //detects if the browser supports webGL or canvas and uses the best option
  width: 1200,
  height: 800,
  backgroundColor: "#93da60",
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
