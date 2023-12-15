import logging
logging.basicConfig(level=logging.INFO)
import argparse
import asyncio
import json
from websocket_server import WebsocketServer
from aiohttp import web
import aiohttp_cors
from configparser import ConfigParser

class Deck:
    def __init__(self):
        #self.filePath        = ""
        #self.title           = ""
        #self.artist          = ""
        #self.album           = ""
        #self.genre           = ""
        #self.comment         = ""
        #self.comment2        = ""
        #self.label           = ""
        #self.mix             = ""
        #self.remixer         = ""
        #self.key             = ""
        #self.keyText         = ""
        #self.gridOffset      = 0
        #self.trackLength     = 0
        #self.elapsedTime     = 0
        #self.nextCuePos      = 0
        #self.bpm             = 0
        #self.tempo           = 0
        #self.resultingKey    = ""
        self.isPlaying       = False
        #self.isSynced        = False
        #self.isKeyLockOn     = False

class Channel:
    def __init__(self):
        self.isOnAir = False

class MasterClock:
    def __init__(self):
        self.deck = None
        #self.bpm = 0

decks = {}
channels = {}
masterClock = MasterClock()

# Make aiohttp shut up
aiohttpLogger = logging.getLogger('aiohttp')
aiohttpLogger.setLevel(logging.WARNING)

async def get_json(request):
    try:
        return await request.json()
    except json.decoder.JSONDecodeError:
        # TODO - Handle this error
        return None
    
def create_broadcast_data(event, data, id):
    if id is None:
        broadcastData = { "event": event, "data": data }
    else:
        broadcastData = { "event": event, "id": id, "data": data }
    jsonBroadcastData = json.dumps(broadcastData)    
    logging.info('create_broadcast_data for {}'.format(event))
    pretty_json = json.dumps(broadcastData, indent=4)
    logging.debug(pretty_json)    
    return jsonBroadcastData

async def process_deck_loaded(request):
    clientIp = request.remote
    deck = request.match_info.get('deck')
    requestData = await get_json(request)

    logging.info('process_deck_loaded for Deck {} | Client IP: {}'.format(deck, clientIp))
    pretty_json = json.dumps(requestData, indent=4)
    logging.debug(pretty_json)

    if not deck in decks:
        logging.info('Deck {} is not initialized, initializing for the first time.'.format(deck))
        decks[deck] = Deck()
    
    for k in requestData.keys():
        setattr(decks[deck], k, requestData[k])

    broadcastData = create_broadcast_data('deckLoaded', requestData, deck)
    ws.send_message_to_all(broadcastData)
    
    
async def process_update_deck(request):
    clientIp = request.remote
    deck = request.match_info.get('deck')
    requestData = await get_json(request)

    logging.info('process_update_deck for Deck {} | Client IP: {}'.format(deck, clientIp))
    pretty_json = json.dumps(requestData, indent=4)
    logging.debug(pretty_json)

    if not deck in decks:
        logging.warning('Deck {} is not initialized for an update, initializing for the first time but requires to load the deck again for full data.'.format(deck))
        decks[deck] = Deck()

    # Update local data
    for k in requestData.keys():
        setattr(decks[deck], k, requestData[k])

    broadcastData = create_broadcast_data('updateDeck', requestData, deck)
    ws.send_message_to_all(broadcastData)

async def process_update_channel(request):
    clientIp = request.remote
    channel = request.match_info.get('channel')
    requestData = await get_json(request)
    pretty_json = json.dumps(requestData, indent=4)

    logging.info('process_update_channel for Channel {} | Client IP: {}'.format(channel, clientIp))
    logging.debug(pretty_json)

    if not channel in channels:
        logging.info('Channel {} is not initialized for an update, initializing for the first time.'.format(channel))
        channels[channel] = Channel()

    # Update local data
    for k in requestData.keys():
        setattr(channels[channel], k, requestData[k])

    broadcastData = create_broadcast_data('updateChannel', requestData, channel)
    ws.send_message_to_all(broadcastData)

async def process_update_master_clock(request):
    clientIp = request.remote
    requestData = await get_json(request)
    pretty_json = json.dumps(requestData, indent=4)

    logging.info('process_update_master_clock | Client IP: {}'.format(clientIp))
    logging.debug(pretty_json)

    # Update local data
    for k in requestData.keys():
        setattr(masterClock, k, requestData[k])

    broadcastData = create_broadcast_data('updateMasterClock', requestData, None)
    ws.send_message_to_all(broadcastData)

async def get_deck(request):
    clientIp = request.remote
    deck = str(request.match_info.get('deck'))

    logging.info('get_deck for deck {} | Client IP: {}'.format(deck, clientIp))   

    if not deck in decks:
        logging.info('Deck {} is not loaded.'.format(deck))
        return web.HTTPNotFound(reason='Deck {} is not loaded.'.format(deck))

    responseData = vars(decks[deck])
    logging.debug(responseData)
    return web.json_response(responseData)

async def get_channel(request):
    clientIp = request.remote
    channel = request.match_info.get('channel')

    logging.info('get_channel for channel {} | Client IP: {}'.format(channel, clientIp))    

    if not channel in channels:
        logging.info('Channel {} is not initialized.'.format(channel))
        return web.HTTPNotFound(reason='Channel {} is not initialized.'.format(channel))

    responseData = vars(channels[channel])
    logging.debug(responseData)
    return web.json_response(responseData)

async def get_master_clock(request):
    clientIp = request.remote
    logging.info('get_master_clock | Client IP: {}'.format(clientIp))

    responseData = vars(masterClock)
    logging.debug(responseData)
    return web.json_response(responseData)

async def get_player(request):
    clientIp = request.remote
    deck = request.match_info.get('deck')

    if deck == 'script.js':
        return web.FileResponse('./player/script.js')
    if deck == 'style.css':
        return web.FileResponse('./player/style.css')

    logging.info('get_player for deck {} | Client IP: {}'.format(deck, clientIp))

    # There are more elegant ways of doing this but if you reading this...
    # I want you to know that Traktor Pro 3 has four decks only.
    # We let the player load even if the deck is not initialized.
    # This way we can open Traktor Pro 3 and OBS in any order and await for connections.
    if deck == 'A' or deck == 'B' or deck == 'C' or deck == 'D':
        return web.FileResponse('./player/player.html')
    
    return web.HTTPNotFound(reason='Deck {} is not available.'.format(deck))

async def get_ws_info(request):
    clientIp = request.remote
    logging.info('get_ws_info | Client IP: {}'.format(clientIp))
    address = wsAddress
    if wsAddress == '0.0.0.0':
        address = '127.0.0.1'

    responseData = { 'address': address, 'port': wsPort }
    logging.debug(responseData)
    return web.json_response(responseData)

def ws_new_client(client, server):
	logging.info('Client connected to Websocket Server | Client ID: {} | Client Address: {}'.format(client['id'], client['address']))

def setup_cors(corsDomains):
    cors_settings = {
        "allow_credentials": True,
        "expose_headers": "*",
        "allow_headers": "*"
    }
    
    resource_options = aiohttp_cors.ResourceOptions(**cors_settings)
    defaults = {domain: resource_options for domain in corsDomains}
    cors = aiohttp_cors.setup(app, defaults=defaults)

    for route in list(app.router.routes()):
        cors.add(route)

async def main():

    config = ConfigParser()
    config.read('config.ini')

    # Command line args take priority, with fallback to config.ini, and further fallback to defaults.
    parser = argparse.ArgumentParser(description='A Python-based program to help sync videos in OBS with Traktor Pro 3')
    parser.add_argument('--http_bind_address', dest='http_bind_address', default=config.get('http', 'bind_to_address', fallback='0.0.0.0'))
    parser.add_argument('--http_bind_port', dest='http_bind_port', type=int, default=config.getint('http', 'bind_to_port', fallback=8080))
    parser.add_argument('--cors_domains', dest='cors_domains', default=config.get('http', 'cors_domains', fallback='*'))
    parser.add_argument('--ws_bind_address', dest='ws_bind_address', default=config.get('ws', 'bind_to_address', fallback='0.0.0.0'))
    parser.add_argument('--ws_bind_port', dest='ws_bind_port', type=int, default=config.get('ws', 'bind_to_port', fallback=8081))
    args = parser.parse_args()

    global httpAddress
    httpAddress = args.http_bind_address
    global httpPort
    httpPort = args.http_bind_port
    corsDomains = args.cors_domains.split(',')
    global wsAddress
    wsAddress = args.ws_bind_address
    global wsPort
    wsPort = args.ws_bind_port

    logging.info('CORS Domains Accepted: {}'.format(", ".join(corsDomains)))

    global app 
    app = web.Application()

    app.add_routes([        
        web.static('/media', './media/', show_index=True, follow_symlinks=True),
        web.get('/player/{deck}', get_player),
        web.get('/deck/{deck}', get_deck),
        web.get('/channel/{channel}', get_channel),
        web.get('/masterClock/', get_master_clock),
        web.get('/ws/', get_ws_info),
        web.post('/deckLoaded/{deck}', process_deck_loaded),
        web.post('/updateDeck/{deck}', process_update_deck),
        web.post('/updateMasterClock', process_update_master_clock),
        web.post('/updateChannel/{channel}', process_update_channel)
    ])

    setup_cors(corsDomains)

    # Set up the Websocket Server
    global ws
    ws = WebsocketServer(host=wsAddress, port=wsPort, loglevel=logging.WARNING)
    ws.set_fn_new_client(ws_new_client)
    ws.run_forever(True)
    logging.info('Websocket Server Running: {}:{}'.format(wsAddress, wsPort))

    # Set up the Web server
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, httpAddress, httpPort).start()
    logging.info('HTTP Server Running: {}:{}'.format(httpAddress, httpPort))

    # Wait forever, running both the Web and Websocket server
    await asyncio.Event().wait()

try:
    asyncio.run(main())
except KeyboardInterrupt:
    # TODO - Graceful shutdown
    # This is not graceful, we should cleanup the web server runner, disconnect Websocket clients and finish the Websocket thread.
    print('Exiting...')