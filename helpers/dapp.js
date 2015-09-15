var cryptoLib = require('../lib/crypto.js');
var ByteBuffer = require('bytebuffer');
var bignum = require('browserify-bignum');

function getBytes(block, skipSignature) {
	var size = 8 + 4 + 4 + 4 + 32 + 32 + 8 + 4 + 4 + 64;

	var bb = new ByteBuffer(size, true);

	if (block.prevBlockId) {
		var pb = bignum(block.prevBlockId).toBuffer({size: '8'});
		for (var i = 0; i < 8; i++) {
			bb.writeByte(pb[i]);
		}
	} else {
		for (var i = 0; i < 8; i++) {
			bb.writeByte(0);
		}
	}

	bb.writeInt(block.height);
	bb.writeInt(block.timestamp);
	bb.writeInt(block.payloadLength);

	var ph = new Buffer(block.payloadHash, 'hex');
	for (var i = 0; i < ph.length; i++) {
		bb.writeByte(ph[i]);
	}

	var pb = new Buffer(block.delegate, 'hex');
	for (var i = 0; i < pb.length; i++) {
		bb.writeByte(pb[i]);
	}

	var pb = bignum(block.pointId).toBuffer({size: '8'});
	for (var i = 0; i < 8; i++) {
		bb.writeByte(pb[i]);
	}

	bb.writeInt(block.pointHeight);

	bb.writeInt(block.count);

	if (!skipSignature && block.signature) {
		var pb = new Buffer(block.signature, 'hex');
		for (var i = 0; i < pb.length; i++) {
			bb.writeByte(pb[i]);
		}
	}

	bb.flip();
	var b = bb.toBuffer();

	return b;
}

module.exports = {
	new: function (genesisAccount, genesisBlock, publicKeys) {
		var block = {
			delegate: genesisAccount.keypair.publicKey,
			delegates: publicKeys,
			height: 1,
			pointId: genesisBlock.id,
			pointHeight: 1,
			payloadLength: 0,
			payloadHash: new Buffer(32).toString('hex'),
			count: 0,
			transactions: [],
			timestamp: 0
		}

		var bytes = getBytes(block);
		block.signature = cryptoLib.sign(genesisAccount.keypair, bytes);
		bytes = getBytes(block);
		block.id = cryptoLib.getId(bytes);

		return block;
	}
}