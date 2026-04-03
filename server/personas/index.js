'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function getAllPersonas() {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
}

function getPersonaById(id) {
  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getRandomPersona() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const file = files[Math.floor(Math.random() * files.length)];
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

module.exports = { getAllPersonas, getPersonaById, getRandomPersona };
