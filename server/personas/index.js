'use strict';

const marcusWebb = require('./data/marcus-webb.json');
const rosaDelgado = require('./data/rosa-delgado.json');
const tylerKowalski = require('./data/tyler-kowalski.json');
const priyaChandrasekaran = require('./data/priya-chandrasekaran.json');
const jamesOkafor = require('./data/james-okafor.json');
const brittanyWalsh = require('./data/brittany-walsh.json');

const personas = {
  'marcus-webb': marcusWebb,
  'rosa-delgado': rosaDelgado,
  'tyler-kowalski': tylerKowalski,
  'priya-chandrasekaran': priyaChandrasekaran,
  'james-okafor': jamesOkafor,
  'brittany-walsh': brittanyWalsh,
};

module.exports = personas;
