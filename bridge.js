var mc16 = require('minecraft-protocol'),
	mc17 = require('./minecraft-protocol-1.7'),
	zlib = require('zlib'),
	states = mc17.protocol.states,
	mcauth = require('./mcauth');

var remote_server = {
	host: '127.0.0.1',//'dorm.wolfholo.ml',
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
	
	client.once(0x02, onHandshake); // my additional handshake
	function onHandshake(packet) {
		client.serverHost = packet.serverHost;
	}
});

function ip2RealIpPacket(socket, flag) {
	var packet = {}
	// client addr
	packet.ca01 = packet.ca02 = packet.ca03 = packet.ca04 = packet.ca05 = packet.ca06 = packet.ca07 = packet.ca08 = packet.ca09 = packet.ca10 = 0;
	packet.ca11 = packet.ca12 = 0xff;
	var cap = socket.remoteAddress.split(".");
	packet.ca13 = parseInt(cap[0], 10);
	packet.ca14 = parseInt(cap[1], 10);
	packet.ca15 = parseInt(cap[2], 10);
	packet.ca16 = parseInt(cap[3], 10);
	// client port
	packet.cp = socket.remotePort;
	// server addr
	packet.sa01 = packet.sa02 = packet.sa03 = packet.sa04 = packet.sa05 = packet.sa06 = packet.sa07 = packet.sa08 = packet.sa09 = packet.sa10 = 0;
	packet.sa11 = packet.sa12 = 0xff;
	var sap = socket.localAddress.split(".");
	packet.sa13 = parseInt(sap[0], 10);
	packet.sa14 = parseInt(sap[1], 10);
	packet.sa15 = parseInt(sap[2], 10);
	packet.sa16 = parseInt(sap[3], 10);
	// server port
	packet.sp = socket.localPort;
	// flag
	packet.flag = flag;
	// return
	return packet;
}

server.on('login', function(client) {
	mcauth(client.serverHost, client.username, function(err, data) {
		if (err) {
			client.write(0xff, { reason: "Server Error!" });
			console.log(err);
		} else {
			if (data.error && !data.ban) client.write(0xff, { reason: data.error });
			else {
				if (data.result == 'Online') {
					//client.write(0xff, { reason: "Preium User => change port to 34985" });
clientLoggedIn(client, ip2RealIpPacket(client.socket, 1));
				} else if (data.result == 'Port') {
					clientLoggedIn(client, ip2RealIpPacket(client.socket, 1));
				} else {
					clientLoggedIn(client, ip2RealIpPacket(client.socket, 0));
				}
			}
		}
	});
});


function clientLoggedIn(client, realip) {
	var mcclient = mc17.createClient({
		host: remote_server.host,
		port: remote_server.port,
		//username: "guest"   // for test
		username: client.username,
		realip: realip
	});
	
	var addr = client.socket.remoteAddress + ':' + client.socket.remotePort;
	
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
	
	var packet2ClientCount = 0;
	var packet2ClientQueue = [];
	var packet2ClientPakcets = {};
	var packet2ClientSending = false;
	function writePacket(no, id, packet) { // no === false   =>  setImmediate call
		if (no !== false) {
			packet2ClientPakcets[no] = packet;
			packet.targetId = id;
		}
		if (packet2ClientQueue[0] + 50000 < no) { // i'm not sure why i choose this number XD
			client.end("Maybe this ridge is too tired!");
console.log(packet2ClientQueue[0], packet2ClientPakcets[packet2ClientQueue[0]]);
		}
try {
		if (!packet2ClientSending || no === false) { // try to send when free or inner call
			packet2ClientSending = true; // processing !
			var head = packet2ClientQueue[0];
			var packet = packet2ClientPakcets[head];
			if (packet) { // got packet - send it out!
				packet2ClientQueue.shift(); // remove first - we have sent it
				delete packet2ClientPakcets[head]; // remove it form pending list
				client.write(packet.targetId, packet); // sent it out~
				setImmediate(function () { writePacket(false) }); // try to send next packet
			} else { // no packet can be sent - wait for next pending packet
				packet2ClientSending = false;
			}
		}
} catch (err) {
	console.log('s2c', err.stack, packet);
	client.end("Packet error!");
}
	}
	function removePendingPacket(no) {
		packet2ClientQueue.splice(packet2ClientQueue.indexOf(no), 1);
	}
	
	mcclient.on('packet', function(packet) { // server to clinet (1.7 to 1.6)
		var packetNo = packet2ClientCount ++;
		if (mcclient.state == states.PLAY) { // OWO
			if (packet.id == 2 && packet.username) { // weird to receive login success packet here - drop it
				//console.log(packet);
				return;
			}
			packet2ClientQueue.push(packetNo); // !!! IMPORTANT !!! - remember to remove packet that didn't sent out
last_packet = packet;
			switch(packet.id) { // 1.7 packet to 1.6 translate
			case 0x00: // keepalive
				writePacket(packetNo, 0x00, packet);
				break;
			case 0x01: // join game
				packet.levelType = fixLevelType(packet.levelType);
				writePacket(packetNo, 0x01, packet);
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
				writePacket(packetNo, 0x03, packet);
				break;
			case 0x03: // time update
				writePacket(packetNo, 0x04, packet);
				break;
			case 0x04: // entity equipment
				if (packet.item)
					writePacket(packetNo, 0x05, packet);
				else
					removePendingPacket(packetNo);
				break;
			case 0x05: // spawn position
				writePacket(packetNo, 0x06, packet);
				break;
			case 0x06: // update health
				writePacket(packetNo, 0x08, packet);
				break;
			case 0x07: // respawn
				packet.worldHeight = 256;
				packet.levelType = fixLevelType(packet.levelType);
				packet.gameMode = packet.gamemode;
				writePacket(packetNo, 0x09, packet);
				break;
			case 0x08: // player position
				packet.stance = packet.y;
				writePacket(packetNo, 0xd, packet);
				break;
			case 0x09: // held item
			case 0x0a: // use bed
			case 0x0b: // animation
				writePacket(packetNo, packet.id + 7, packet);
				break;
			case 0x0c: // spawn player (almost the same to spawn named entity in 1.6)
				packet.name = packet.playerName;
				writePacket(packetNo, 0x14, packet);
				break;
			case 0x0d: // collect item
			case 0x0e: // spawn object
			case 0x0f: // spawn mob
				writePacket(packetNo, packet.id + 9, packet);
				break;
			case 0x10: // spawn painting
				packet.name = packet.title;
				writePacket(packetNo, 0x19, packet);
				break;
			case 0x11: // spawn exp orb
				writePacket(packetNo, 0x1a, packet);
				break;
			case 0x12: // entity velocity
			case 0x13: // destory entity
			case 0x14: // entity
				writePacket(packetNo, packet.id + 0xa, packet);
				break;
			case 0x15: // entity relative move
				packet.dx = packet.dX;
				packet.dy = packet.dY;
				packet.dz = packet.dZ;
				writePacket(packetNo, 0x1f, packet);
				break;
			case 0x16: // entity look
				writePacket(packetNo, 0x20, packet);
				break;
			case 0x17: // entity look & relative move
				packet.dx = packet.dX;
				packet.dy = packet.dY;
				packet.dz = packet.dZ;
				writePacket(packetNo, 0x21, packet);
				break;
			case 0x18: // entity teleport
			case 0x19: // entity head look
				writePacket(packetNo, packet.id + 0xa, packet);
				break;
			case 0x1a: // entity status - may need fix ? /////////////
				writePacket(packetNo, 0x26, packet);
				break;
			case 0x1b: // attach entity
				packet.leash = packet.leash ? 1 : 0
				writePacket(packetNo, 0x27, packet);
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
				writePacket(packetNo, 0x28, packet);
				break;
			case 0x1d: // entity effect
			case 0x1e: // remove entity effect
			case 0x1f: // set exp
			case 0x20: // entity prop
				writePacket(packetNo, packet.id + 0xc, packet);
				break;
			case 0x21: // chunk data
				if (packet.groundUp && packet.bitMap == 0) { // unload chunk
					writePacket(packetNo, 0x33, packet);
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
						zlib.deflate(buffer, function(err, data) {
							packet.compressedChunkData = data;
							writePacket(packetNo, 0x33, packet);
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
				writePacket(packetNo, 0x34, packet);
				break;
			case 0x23: // block change
				var newId = blockAndItemReplace(packet.type);
				if (newId !== false) packet.type = newId; // must !== (distinguish false & 0 => air)
				writePacket(packetNo, 0x35, packet);
				break;
			case 0x24: // block action
			case 0x25: // block break ani
				writePacket(packetNo, packet.id + 0x12, packet);
				break;
			case 0x26: // map chunk bulk
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
					zlib.deflate(buffer, function(err, data) {
						packet.data.compressedChunkData = data;
						writePacket(packetNo, 0x38, packet);
					});
				});
				break;
			case 0x27: // explosion
				writePacket(packetNo, 0x3c, packet);
				break;
			case 0x28: // effect
				if (packet.effectId == 2001) { // block break particle
					var newId = blockAndItemReplace(packet.data);
					if (newId !== false) packet.data = newId; // must !== (distinguish false & 0 => air)
				}
				writePacket(packetNo, 0x3d, packet);
				break;
			case 0x29: // sound effect
				packet.pitch = packet.pitch > 127 ? 127 : packet.pitch
				writePacket(packetNo, 0x3e, packet);
				break;
			case 0x2a: // particle
				writePacket(packetNo, 0x3f, packet);
				break;
			case 0x2b: // change game state
			case 0x2c: // spawn global entity
				writePacket(packetNo, packet.id + 0x1b, packet);
				break;
			case 0x2d: // open window
			case 0x2e: // close window
				writePacket(packetNo, packet.id + 0x37, packet);
				break;
			case 0x2f: // set slot
				if (packet.windowId != 255) { // not sure why there is an packet for 255 be sent ....
					var newId = blockAndItemReplace(packet.item.id);
					if (newId !== false) { // must !== (distinguish false & 0 => air)
						packet.item.id = newId;
						packet.item.itemDamage = packet.item.itemDamage + 128;
					}
					writePacket(packetNo, 0x67, packet);
				} else
					removePendingPacket(packetNo);
				break;
			case 0x30: // window items
				packet.items.forEach(function(item) {
					var newId = blockAndItemReplace(item.id);
					if (newId !== false) { // must !== (distinguish false & 0 => air)
						item.id = newId;
						item.itemDamage = item.itemDamage + 128;
					}
				});
				writePacket(packetNo, 0x68, packet);
				break;
			case 0x31: // window prop
				writePacket(packetNo, 0x69, packet);
				break;
			case 0x32: // confirm transact
				writePacket(packetNo, 0x6a, packet);
				break;
			case 0x33: // update sign
				writePacket(packetNo, 0x82, packet);
				break;
			//case 0x34: // map
				////////////////////////////////////////////////////////////////////////////////
				//writePacket(packetNo, 0x83, /* need reparse ... */);
				break;
			case 0x35: // update tile entity
				writePacket(packetNo, 0x84, packet);
				break;
			case 0x36: // sign editor open
				writePacket(packetNo, 0x85, packet);
				break;
			//case 0x37: // statics
				////////////////////////////////////////////////////////////////////////////////
				//writePacket(packetNo, 0xc8, /* need reparse ... */);
				break;
			case 0x38: // player list item
				writePacket(packetNo, 0xc9, packet);
				break;
			case 0x39: // player ablities
				writePacket(packetNo, 0xca, packet);
				break;
			case 0x40: // disconnected
				packet.reason = JSON.parse(packet.reason);
				writePacket(packetNo, 0xff, packet);
				break;
			case 0x3a: // tab complete
				var completes = packet.matches.length ? packet.matches[0] : "";
				for(var i = 1; i < packet.matches.length; i++) {
					var newCompletes = completes + '\u0000' + packet.matches[i];
					if (Buffer.byteLength(newCompletes, 'utf16be') > 239) break; // break when length exceed max
					completes = newCompletes;
				}
				writePacket(packetNo, 0xcb, {
					text: completes
				});
				break;
			case 0x3b: // scoreboard objective
			case 0x3c: // update score
			case 0x3d: // display socreboard
			case 0x3e: // teams
				writePacket(packetNo, packet.id + 0x93, packet);
				break;
			case 0x3f: // plugin
				writePacket(packetNo, 0xfa, packet);
				break;
			default:
				removePendingPacket(packetNo);
//console.log(packet);
				break;
			}
		}
	});
	
	client.on('end', function() {
		mcclient.end("disconnected");
		delete packet2ClientQueue, packet2ClientPakcets, mcclient;
delete last_packet;
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
			packet.mouse = packet.leftClick ? 1 : 0
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
			mcclient.write(0x16, {
				payload: packet.payload == 0 ? 1 : 0
			});
			break;
		case 0xfa: // plugin
			mcclient.write(0x17, packet);
			break;
		default:
			break;
		}
} catch (err) {
	console.log('c2s', err.stack, packet);
	mcclient.end("Packet error!");
	client.end("Packet error!");
}
	});
	
	mcclient.on('error', function(error) {
		console.log('Error:', error);
console.log( last_packet );
		mcclient.end("ERROR!");
		client.end("ERROR!");
	});
	
	
	
}

server.on('error', function(error) {
	console.log('Error:', error);
});

server.on('listening', function() {
	console.log('Server listening on port', server.socketServer.address().port);
});
