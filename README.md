# ENGG3000_LEGENDS Whack-a-Mole — Software

**Group:** Group 2 Legends
**Unit:** 2026 S2 ENGG3000 — SPINE Engineering Project
**Team:** Akshara, Fin, Sima

## Overview

This repo covers the software side of the Whack-a-Mole game: the game engine, UI, difficulty/level logic, and the software's handling of incoming ultrasonic sensor data for player tracking.

Full game concept: moles appear randomly on screen, and the player moves within a defined play area to "hit" them before they disappear, using position tracked via ultrasonic sensors only (no camera/other sensor types permitted per updated project spec).

- **Play area:** 1.5 m wide x 1.4 m deep
- **Dead zone:** 60 cm from the screen wall — alarm + visual warning must trigger if a player enters it
- **Sensing input:** ultrasonic only (RCWL-1601), data sent wirelessly from ESP32 sensor boxes
- **Target platform:** downloadable/installable Windows software package, multiple difficulty levels

## Repository Structure

/software — game engine, UI, difficulty/level logic
/docs — software-side notes, meeting logs, design decisions
/tests — sensor data handling tests


*(Update as the repo evolves.)*

## Team

| Name | Focus |
|---|---|
| Sima | Project Manager — SCRUM meetings, sprint planning, backlog |
| Akshara | Documentation/QA — logs, testing records |
| Fin | Software — game engine, integration |

## Project Management

SCRUM meetings held **Sundays** (time subject to change based on availability). Full team Trello board: [Group 2 Legends Trello](https://trello.com/invite/b/6a680511413fbe02ce304631/ATTI8fb3374080625853ab1a2e41a3070c0629178753/group-2-legends)

## Getting Started

*(To be filled in once game engine choice and dev setup are confirmed.)*

## Notes

This repo is scoped to the software subsystem only. Hardware/electronics design and schematics are tracked separately by the hardware team.
