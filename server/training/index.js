'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DEALERSHIPS = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dealerships.json'), 'utf8'));

function getAllDealerships() {
  return DEALERSHIPS;
}

function getRandomDealership() {
  return DEALERSHIPS[Math.floor(Math.random() * DEALERSHIPS.length)];
}

function getDealershipById(id) {
  return DEALERSHIPS.find((d) => d.id === id) || null;
}

function normalizeDifficulty(difficulty) {
  const d = (difficulty || '').toLowerCase();
  return ['easy', 'medium', 'hard'].includes(d) ? d : 'medium';
}

function getGatekeeperForDifficulty(difficulty) {
  const file = path.join(DATA_DIR, 'gatekeepers', `${normalizeDifficulty(difficulty)}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getRandomGM(difficulty) {
  const dir = path.join(DATA_DIR, 'gms');
  const prefix = `${normalizeDifficulty(difficulty)}-`;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  const file = files[Math.floor(Math.random() * files.length)];
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

module.exports = {
  getAllDealerships, getRandomDealership, getDealershipById,
  getGatekeeperForDifficulty, getRandomGM,
  normalizeDifficulty,
};
