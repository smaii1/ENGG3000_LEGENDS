# ENGG3000_LEGENDS — Whack-a-Mole Software

**Group:** Group 2 Legends  
**Unit:** ENGG3000 — SPINE Engineering Project  
**Team:** Akshara, Fin, Sima

## Overview

This repository contains the software component of the Group 2 Legends Whack-a-Mole project.

The game combines a browser-based game interface with an ESP32 ultrasonic sensor system. Players interact with physical positions in the play area, with ultrasonic sensors detecting their movements and sending position information to the game.

The software is responsible for:

- Game engine and gameplay
- User interface (UI)
- Mole spawning and movement
- Scoring
- Difficulty and level progression
- Game timers and lives
- Player position input from ultrasonic sensors
- Communication/integration with the ESP32 sensor system
- Testing and handling of sensor input

The current software prototype is being developed incrementally, starting with a small two-hole Level 1 configuration before expanding to the full game.

---

## Project Concept

The player moves within a defined play area to interact with moles appearing on screen.

Instead of using a mouse or camera to determine player position, the final system will use **ultrasonic sensors (RCWL-1601)** connected to ESP32 boards.

The sensors detect player movement and determine which area of the play space the player is occupying.

### Current Project Specifications

- **Play area:** 1.5 m wide × 1.4 m deep
- **Dead zone:** 60 cm from the screen wall
- **Dead-zone warning:** Alarm and visual warning when the player enters the restricted area
- **Sensing:** Ultrasonic sensors only
- **Sensor:** RCWL-1601
- **Microcontroller:** ESP32
- **Communication:** Wireless communication between sensor boxes and the game
- **Target platform:** Downloadable/installable Windows software package
- **Game:** Multiple difficulty levels

---

## Current Prototype

Development is currently focused on **Level 1** using a reduced two-hole configuration.

### Level 1

- 2 holes
- 2 moles
- 2 physical sensor boxes
- Ultrasonic sensors used to determine player position
- One active mole at a time
- Timer for each mole
- Score increases when the correct mole is hit
- Missed moles count towards the player's lives

The two-hole configuration is being used for initial sensor and software integration testing before expanding the game to additional holes and levels.

---

## Hardware Integration

The software will receive position information from the ESP32 ultrasonic sensor boxes.

### Sensor Prototype

The current hardware prototype consists of:

- 2 physical boxes
- 2 ultrasonic sensors per box
- ESP32-based sensor processing
- Wireless communication between the sensor system and game

The current sensor testing has demonstrated approximately **95.3% accuracy for the left sensor box** during tested movements.

Testing has included:

- Close-distance detection
- Maximum-distance detection
- Angle testing
- Cross-talk testing
- Stationary player detection
- Forward/backward movement
- Left/right movement
- Alarm triggering

Further testing is being conducted on the second sensor box and different sensor angles.

---

## Software

The game is currently being developed using:

- **JavaScript**
- **Phaser 3**
- **HTML5**
- **Live Server**
- **Git/GitHub**

### Current Software Features

The current prototype includes:

- Main menu
- Level selection
- Level progression
- Mole spawning
- Mole timers
- Score tracking
- Lives system
- Game-over screen
- Level completion screen
- Pause menu
- Restart functionality
- Multiple game modes
- Pixel-art style UI
- Custom hammer cursor
- Local storage for level progress and high scores

---

## Repository Structure

```text
ENGG3000_LEGENDS/
│
├── assets/
│   ├── background.png
│   ├── hole.png
│   ├── hammer.png
│   ├── mole.png
│   ├── whacked-mole.png
│   └── missed-mole.png
│
├── src/
│   └── game2.js
│
├── docs/
│   └── meeting logs and project documentation
│
├── tests/
│   └── sensor and software testing
│
├── index.html
├── settings.json
└── README.md

## Project Management

SCRUM meetings are held on **Sundays**, with the meeting time adjusted according to team availability.

The team uses Trello for sprint planning, task tracking, backlog management, and documenting project progress.

**Trello Board:**  
https://trello.com/invite/b/6a680511413fbe02ce304631/ATTI8fb3374080625853ab1a2e41a3070c0629178753/group-2-legends
