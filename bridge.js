var mc16 = require('minecraft-protocol'),
	mc17 = require('./minecraft-protocol-1.7'),
	zlib = require('zlib'),
	states = mc17.protocol.states;

var remote_server = {
	host: 'localhost',
	port: 25565,
};

var options = {
	port: 25665,
	'online-mode': false
};

var server = mc16.createServer(options);

server.on("connection", function(client) {
	client.removeAllListeners(0xfe); // remove default ping
	client.once(0xfe, onPing); // my new ping
	function onPing(packet) {
		mc17.ping({
			host: remote_server.host,
			port: remote_server.port,
		}, function(err, data) {
			if (err) return;
			
			server.playerCount = data.players.online;
			server.maxPlayers = data.players.max;
			
			client.write(0xff, {
				reason: [
					'§1',
					mc16.protocol.version,
					data.version.name + ' - 1.6 bridge',
					'Server for club "Spice and Wolf" - 1.6 bridge', //data.description,
					data.players.online,
					data.players.max,
				].join('\u0000')
			});
		});
	}
});

server.on('login', function(client) {
	var mcclient = mc17.createClient({
		host: remote_server.host,
		port: remote_server.port,
		username: "danny8376"   // for test
	});
	
	var addr = client.socket.remoteAddress + ':' + client.socket.remotePort;
	
	// !!! use this one instead of zlib.deflate, which cause weird behavior
	function deflateData(inbuf, cb) {
		var deflater = zlib.createDeflate({
			flush: zlib.Z_FINISH,
			level: zlib.Z_DEFAULT_COMPRESSION,
			windowBits: zlib.MAX_WBITS,
			data_type: zlib.Z_BINARY
		});
		var outbuf = new Buffer([]);
		deflater.on('data', function(data) {
			data.copy(outbuf, outbuf.length);
		});
		deflater.on('end', function() {
			cb(outbuf);
		});
		deflater.write(inbuf);
	}
	
	function fixLevelType(levelType) {
		// trans new types to similar type
		if (levelType == 'default_1_1') return 'default';
		if (levelType == 'amplified') return 'largeBiomes';
		// otherwise, return it
		return levelType;
	}
	
	function blockAndItemReplace(id) {
		switch(id) {
		case 95: // stained glass -> glass
			return 20;
		case 160:
			return 102;
		case 161:
			return 18;
		case 162:
			return 17;
		case 163:
			return 136
		case 164:
			return 134;
		case 174: // fake packed ice with normal ice
			return 79;
		case 175: // new plants -> old plants
			return 31;
		default:
			return false;
		}
	}
	
var last_packet; // for debug
	
	mcclient.on('packet', function(packet) { // server to clinet (1.7 to 1.6)
try {
		if (mcclient.state == states.PLAY) { // OWO
			if (packet.id == 2 && packet.username) { // weird to receive login success packet here - drop it
				//console.log(packet);
				return;
			}
last_packet = packet;
			switch(packet.id) { // 1.7 packet to 1.6 translate
			case 0x00: // keepalive
				client.write(0x00, packet);
				break;
			case 0x01: // join game
				packet.levelType = fixLevelType(packet.levelType);
				client.write(0x01, packet);
				break;
			case 0x02: // chat
//console.log("ori", packet);
				var msg_json = JSON.parse(packet.message);
				var ret_msg_json = {};
				
				if (msg_json.translate) {
					ret_msg_json.translate = msg_json.translate;
					ret_msg_json.using = msg_json['with'];
				} else {
					ret_msg_json.text = msg_json.text;
					if (msg_json.extra) msg_json.extra.forEach(function(extra) {
						var color = "§f";
						if (typeof extra === "string") ret_msg_json.text += color + extra;
						else if (extra.text) {
							switch(extra.color) {
							case 'black':			color = "§0"; break;
							case 'dark_blue':		color = "§1"; break;
							case 'dark_green':		color = "§2"; break;
							case 'dark_aqua':		color = "§3"; break;
							case 'dark_red':		color = "§4"; break;
							case 'dark_purple':		color = "§5"; break;
							case 'gold':			color = "§6"; break;
							case 'gray':			color = "§7"; break;
							case 'dark_gray':		color = "§8"; break;
							case 'blue':			color = "§9"; break;
							case 'green':			color = "§a"; break;
							case 'aqua':			color = "§b"; break;
							case 'red':				color = "§c"; break;
							case 'light_purple':	color = "§d"; break;
							case 'yellow':			color = "§e"; break;
							case 'white': default:	color = "§f"; break;
							}
							ret_msg_json.text += color + extra.text;
						}
					});
				}
				packet.message = JSON.stringify(ret_msg_json);
//console.log("new", packet);
				client.write(0x03, packet);
				break;
			case 0x03: // time update
				client.write(0x04, packet);
				break;
			case 0x04: // entity equipment
				if (packet.item)
					client.write(0x05, packet);
				break;
			case 0x05: // spawn position
				client.write(0x06, packet);
				break;
			case 0x06: // update health
				client.write(0x08, packet);
				break;
			case 0x07: // update health
				packet.worldHeight = 256;
				packet.levelType = fixLevelType(packet.levelType);
				client.write(0x09, packet);
				break;
			case 0x08: // player position
				packet.stance = packet.y;
				client.write(0xd, packet);
				break;
			case 0x09: // held item
			case 0x0a: // use bed
			case 0x0b: // animation
				client.write(packet.id + 7, packet);
				break;
			case 0x0c: // spawn player (almost the same to spawn named entity in 1.6)
				packet.name = packet.playerName;
				client.write(0x14, packet);
				break;
			case 0x0d: // collect item
			case 0x0e: // spawn object
			case 0x0f: // spawn mob
				client.write(packet.id + 9, packet);
				break;
			case 0x10: // spawn painting
				packet.name = packet.title;
				client.write(0x19, packet);
				break;
			case 0x11: // spawn exp orb
				client.write(0x1a, packet);
				break;
			case 0x12: // entity velocity
			case 0x13: // destory entity
			case 0x14: // entity
				client.write(packet.id + 0xa, packet);
				break;
			case 0x15: // entity relative move
				packet.dx = packet.dX;
				packet.dy = packet.dY;
				packet.dz = packet.dZ;
				client.write(0x1f, packet);
				break;
			case 0x16: // entity look
				client.write(0x20, packet);
				break;
			case 0x17: // entity look & relative move
				packet.dx = packet.dX;
				packet.dy = packet.dY;
				packet.dz = packet.dZ;
				client.write(0x21, packet);
				break;
			case 0x18: // entity teleport
			case 0x19: // entity head look
				client.write(packet.id + 0xa, packet);
				break;
			case 0x1a: // entity status - may need fix ? /////////////
				client.write(0x26, packet);
				break;
			case 0x1b: // attach entity
				packet.leash = packet.leash ? 1 : 0
				client.write(0x27, packet);
				break;
			case 0x1c: // entity metadata
				packet.metadata.forEach(function(submeta) {
					if (submeta.key == 10) { // dropped item stack
						var newId = blockAndItemReplace(submeta.value.id);
						if (newId !== false) { // must !== (distinguish false & 0 => air)
							submeta.value.id = newId;
							submeta.value.itemDamage = submeta.value.itemDamage + 128;
						}
					} else if (submeta.key == 2) { // item frame item
						var newId = blockAndItemReplace(submeta.value.id);
						if (newId !== false) { // must !== (distinguish false & 0 => air)
							submeta.value.id = newId;
						}
					}
				});
				client.write(0x28, packet);
				break;
			case 0x1d: // entity effect
			case 0x1e: // remove entity effect
			case 0x1f: // set exp
			case 0x20: // entity prop
				client.write(packet.id + 0xc, packet);
				break;
			case 0x21: // chunk data
				if (packet.groundUp && packet.bitMap == 0) { // unload chunk
					client.write(0x33, packet);
				} else {
					zlib.inflate(packet.compressedChunkData, function(err, buffer) {
						var layers = 0;
						for(var r = 0; r < 16; r++) {
							 if ( packet.bitMap & (1 << r) ) layers++;
						}
						for(var l = 0; l < layers; l++) {
							for(var y = 0; y < 16; y++) {
								for(var z = 0; z < 16; z++) {
									for(var x = 0; x < 16; x++) {
										var offset = l * 16 * 16 * 16 + y * 16 * 16 + z * 16 + x;
										var main_id = buffer.readUInt8(offset);
										var id = main_id;
										// replace
										var newId = blockAndItemReplace(id);
										if (newId !== false) // must !== (distinguish false & 0 => air)
											buffer.writeUInt8(newId, offset);
									}
								}
							}
						}
						deflateData(buffer, function(data) {
							packet.compressedChunkData = data;
							client.write(0x33, packet);
						});
					});
				}
				break;
			case 0x22: // multi block change
				for(var i = 0; i < packet.recordCount; i++) {
					var data = packet.data.readInt32BE(i * 4);
					var id = (data & 0x0000fff0) >> 4;
					var newId = blockAndItemReplace(id);
					if (newId !== false) { // must !== (distinguish false & 0 => air)
						data = (data & 0xffff000f) | (newId << 4);
						packet.data.writeInt32BE(data, i * 4);
					}
				}
				client.write(0x34, packet);
				break;
			case 0x23: // block change
				var newId = blockAndItemReplace(packet.type);
				if (newId !== false) packet.type = newId; // must !== (distinguish false & 0 => air)
				client.write(0x35, packet);
				break;
			case 0x24: // block action
			case 0x25: // block break ani
				client.write(packet.id + 0x12, packet);
				break;
			case 0x26: // map chunk bulk
				//*
				zlib.inflate(packet.data.compressedChunkData, function(err, buffer) {
					var layer_offset = 16 * 16 * (packet.data.skyLightSent ? 40 : 32); // 16 + 8 + 8 + [8] + (8 --- won't exist in vailla now, just ignore it OwO --- )
					var main_offset = 0;
					for(var i = 0; i < packet.data.meta.length; i++) {
						var meta = packet.data.meta[i];
						var layers = 0;
						for(var r = 0; r < 16; r++) {
							 if ( meta.bitMap & (1 << r) ) layers++;
						}
						for(var l = 0; l < layers; l++) {
							for(var y = 0; y < 16; y++) {
								for(var z = 0; z < 16; z++) {
									for(var x = 0; x < 16; x++) {
										var offset = l * 16 * 16 * 16 + y * 16 * 16 + z * 16 + x;
										var main_id = buffer.readUInt8(main_offset + offset);
										var id = main_id;
										// replace
										var newId = blockAndItemReplace(id);
										if (newId !== false) // must !== (distinguish false & 0 => air)
											buffer.writeUInt8(newId, main_offset + offset);
									}
								}
							}
						}
						// plus main offset
						main_offset += layers * layer_offset + 16 * 16;
					}
					// compress & send out packet
					// !!! notice !!! - don't use zlib.deflate, which cause weird behavior
					deflateData(buffer, function(data) {
						packet.data.compressedChunkData = data;
						client.write(0x38, packet);
					});
				});
				//*/
				client.write(0x38, packet);
				break;
			case 0x27: // explosion
				client.write(0x3c, packet);
				break;
			case 0x28: // effect
				if (packet.effectId == 2001) { // block break particle
					var newId = blockAndItemReplace(packet.data);
					if (newId !== false) packet.data = newId; // must !== (distinguish false & 0 => air)
				}
				client.write(0x3d, packet);
				break;
			case 0x29: // sound effect
				packet.pitch = packet.pitch > 127 ? 127 : packet.pitch
				client.write(0x3e, packet);
				break;
			case 0x2a: // particle
				client.write(0x3f, packet);
				break;
			case 0x2b: // change game state
			case 0x2c: // spawn global entity
				client.write(packet.id + 0x1b, packet);
				break;
			case 0x2d: // open window
			case 0x2e: // close window
				client.write(packet.id + 0x37, packet);
				break;
			case 0x2f: // set slot
				if (packet.windowId != 255) { // not sure why there is an packet for 255 be sent ....
					var newId = blockAndItemReplace(packet.item.id);
					if (newId !== false) { // must !== (distinguish false & 0 => air)
						packet.item.id = newId;
						packet.item.itemDamage = packet.item.itemDamage + 128;
					}
					client.write(0x67, packet);
				}
				break;
			case 0x30: // window items
				packet.items.forEach(function(item) {
					var newId = blockAndItemReplace(item.id);
					if (newId !== false) { // must !== (distinguish false & 0 => air)
						item.id = newId;
						item.itemDamage = item.itemDamage + 128;
					}
				});
				client.write(0x68, packet);
				break;
			case 0x31: // window prop
				client.write(0x69, packet);
				break;
			case 0x32: // confirm transact
				client.write(0x6a, packet);
				break;
			case 0x33: // update sign
				client.write(0x82, packet);
				break;
			case 0x34: // map
				////////////////////////////////////////////////////////////////////////////////
				//client.write(0x83, /* need reparse ... */);
				break;
			case 0x35: // update tile entity
				client.write(0x84, packet);
				break;
			case 0x36: // sign editor open
				client.write(0x85, packet);
				break;
			case 0x37: // statics
				////////////////////////////////////////////////////////////////////////////////
				//client.write(0xc8, /* need reparse ... */);
				break;
			case 0x38: // player list item
				client.write(0xc9, packet);
				break;
			case 0x39: // player ablities
				client.write(0xca, packet);
				break;
/*
			case 0x40: // disconnected
				client.write(0xff, packet);
				break;
*/
			case 0x3a: // tab complete
				//
				client.write(0xcb, {
					text: packet.matches.slice(0,20 /* 20 as limit OwO */ ).join('\u0000')
				});
				break;
			case 0x3b: // scoreboard objective
			case 0x3c: // update score
			case 0x3d: // display socreboard
			case 0x3e: // teams
				client.write(packet.id + 0x93, packet);
				break;
			case 0x3f: // plugin
				client.write(0xfa, packet);
				break;
			default:
console.log(packet);
				break;
			}
		}
} catch (err) {
	console.log('s2c', err.stack, packet);
	client.end();
}
	});
	
	client.on('end', function() {
		mcclient.end("disconnected");
		console.log(client.username+' disconnected', '('+addr+')');
	});
	
	client.on('packet', function(packet) { // client to server (1.6 to 1.7)
		if (mcclient.state != states.PLAY) return;
try {
		switch(packet.id) { // 1.6 packet to 1.7 translate
		case 0x00: // keepalive
			mcclient.write(0x00, packet);
			break;
		case 0x03: // chat
			mcclient.write(0x01, packet);
			break;
		case 0x07: // use entity
			packet.leftClick = packet.leftClick === 0
			mcclient.write(0x02, packet);
			break;
		case 0x0a: // player
			mcclient.write(0x03, packet);
			break;
		case 0x0b: // player pos
			packet.feetY = packet.y
			packet.headY = packet.stance
			mcclient.write(0x04, packet);
			break;
		case 0x0c: // player look
			mcclient.write(0x05, packet);
			break;
		case 0x0d: // player pos & look
			packet.feetY = packet.y
			packet.headY = packet.stance
			mcclient.write(0x06, packet);
			break;
		case 0x0e: // player dig
			if (packet.face == 255) packet.face = 0; // ??????????????
			mcclient.write(packet.id - 7, packet);
			break;
		case 0x0f: // player block placement
		case 0x10: // held item change
			mcclient.write(packet.id - 7, packet);
			break;
		case 0x12: // animation
			mcclient.write(0x0a, packet);
			break;
		case 0x13: // entity action
			mcclient.write(0x0b, packet);
			break;
		case 0x1b: // steer vehicle
			mcclient.write(0x0c, packet);
			break;
		case 0x65: // close window
			mcclient.write(0x0d, packet);
			break;
		case 0x66: // click window
			mcclient.write(0x0e, packet);
			break;
		case 0x6a: // confirm transac
			mcclient.write(0x0f, packet);
			break;
		case 0x6b: // creative inv act
			mcclient.write(0x10, packet);
			break;
		case 0x6c: // enchant
			mcclient.write(0x11, packet);
			break;
		case 0x82: // update sign
			mcclient.write(0x12, packet);
			break;
		case 0xca: // player ablity
			mcclient.write(0x13, packet);
			break;
		case 0xcb: // tab complete
			mcclient.write(0x14, packet);
			break;
		case 0xcc: // client settings
			packet.chatFlags = packet.chatFlags | 0x4
			packet.chatColors = (packet.chatFlags & 0x4) === 1;
			mcclient.write(0x15, packet);
			break;
		case 0xcd: // client status
//console.log(packet);
//if (packet.payload == 0) mcclient.write(0x16, {payload: 1});
if (packet.payload != 0) mcclient.write(0x16, {payload: 0});
			//mcclient.write(0x16, packet);
			break;
		case 0xfa: // plugin
			mcclient.write(0x17, packet);
			break;
		default:
			break;
		}
} catch (err) {
	console.log('c2s', err.stack, packet);
	mcclient.end();
	client.end();
}
	});
	
	mcclient.on('error', function(error) {
		console.log('Error:', error);
console.log( last_packet );
		mcclient.end("");
		client.end("");
	});
	
	
	
});

server.on('error', function(error) {
	console.log('Error:', error);
});

server.on('listening', function() {
	console.log('Server listening on port', server.socketServer.address().port);
});
