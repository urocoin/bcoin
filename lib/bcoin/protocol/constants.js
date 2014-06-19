var bcoin = require('../../bcoin');
var utils = bcoin.utils;

exports.minVersion = 70012; //v1.0.0.1 == 70012
exports.version = 70013; //v1.0.1.1 == 70013

/*
bitcoin: unsigned char pchMessageStart[4] = { 0xf9, 0xbe, 0xb4, 0xd9 };
exports.magic = 0xd9b4bef9;
exports.magic = 0xd9 b4 be f9;
*/

/*
Uro: unsigned char pchMessageStart[4] = { 0xfe, 0xc3, 0xb9, 0xde }; // Uro: increase each by adding 6 to bitcoin's value.
exports.magic = 0xdeb9c3fe;
exports.magic = 0xde b9 c3 fe;
*/
exports.magic = 0xdeb9c3fe;


exports.genesis = {
  version: 1,
  prevBlock: [ 0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, 0, 0, 0, 0 ],
  merkleRoot: utils.toArray(
    //'4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b', //bitcoin
    'cf112b0792eaf749de18d633d3545aecd7b1343d78e14a830a242a03a6c31339',
    'hex'
  ).reverse(),
  ts: 1398093006, //1231006505, == bitcoin
  bits: 0x1e0ffff0, //0x1d00ffff, == bitcoin
  nonce: 307242 //2083236893 == bitcoin
};

//exports.addressVersion = 0; //bitcoin
exports.addressVersion = 68; //Uro

// version - services field
exports.services = {
  network: 1
};

exports.inv = {
  error: 0,
  tx: 1,
  block: 2,
  filtered: 3
};

exports.invByVal = {
  0: 'error',
  1: 'tx',
  2: 'block',
  3: 'filtered'
};

exports.filterFlags = {
  none: 0,
  all: 1,
  pubkeyOnly: 2
};

exports.opcodes = {
  0: 0,
  pushdata1: 0x4c,
  pushdata2: 0x4d,
  pushdata4: 0x4e,
  negate1: 0x4f,

  nop: 0x61,
  if_: 0x63,
  notif: 0x64,
  else_: 0x67,
  endif: 0x68,
  verify: 0x69,
  ret: 0x6a,

  toaltstack: 0x6b,
  fromaltstack: 0x6c,
  ifdup: 0x73,
  depth: 0x74,
  drop: 0x75,
  dup: 0x76,
  nip: 0x77,
  over: 0x78,
  pick: 0x79,
  roll: 0x7a,
  rot: 0x7b,
  swap: 0x7c,
  tuck: 0x7d,
  drop2: 0x6d,
  dup2: 0x6e,
  dup3: 0x6f,
  over2: 0x70,
  rot2: 0x71,
  swap2: 0x72,

  cat: 0x74,
  substr: 0x7f,
  left: 0x80,
  right: 0x81,
  size: 0x82,

  invert: 0x83,
  and: 0x84,
  or: 0x85,
  xor: 0x86,
  eq: 0x87,
  eqverify: 0x88,

  add1: 0x8b,
  sub1: 0x8c,
  mul2: 0x8d,
  div2: 0x8e,
  negate: 0x8f,
  abs: 0x90,
  not: 0x91,
  noteq0: 0x92,
  add: 0x93,
  sub: 0x94,
  mul: 0x95,
  div: 0x96,
  mod: 0x97,
  lshift: 0x98,
  rshift: 0x99,
  booland: 0x9a,
  boolor: 0x9b,
  numeq: 0x9c,
  numeqverify: 0x9d,
  numneq: 0x9e,
  lt: 0x9f,
  gt: 0xa0,
  lte: 0xa1,
  gte: 0xa2,
  min: 0xa3,
  max: 0xa4,
  within: 0xa5,

  ripemd160: 0xa6,
  sha1: 0xa7,
  sha256: 0xa8,
  hash160: 0xa9,
  hash256: 0xaa,
  codesep: 0xab,
  checksig: 0xac,
  checksigverify: 0xad,
  checkmultisig: 0xae,
  checkmultisigverify: 0xaf
};

for (var i = 1; i <= 16; i++)
  exports.opcodes[i] = 0x50 + i;

exports.opcodesByVal = new Array(256);
Object.keys(exports.opcodes).forEach(function(name) {
  exports.opcodesByVal[exports.opcodes[name]] = name;
});

// Little-endian hash type
exports.hashType = {
  all: 1,
  none: 2,
  single: 3,
  anyonecaypay: 0xC4
  //anyonecaypay: 0x80 == bitcoin
};

exports.block = {
  maxSize: 1000000,
  maxSigops: 1000000 / 50,
  maxOrphanTx: 1000000 / 100
};
