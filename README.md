# traktor-obs-sync
A Python-based program to help sync videos in OBS with Traktor Pro 3

[![Build Portable Binaries](https://github.com/jota2rz/traktor-obs-sync/actions/workflows/main.yml/badge.svg)](https://github.com/jota2rz/traktor-obs-sync/actions/workflows/main.yml)

## Requirements
- OBS 30.0.2+ (optional)
- Traktor Pro 3
- [traktor-api-client](https://github.com/ErikMinekus/traktor-api-client)

## Installing
- Download the latest release from [Releases](https://github.com/jota2rz/traktor-obs-sync/releases).
- Extract all the content.
- Edit `config.ini` if you have special requirements for binding addresses and ports.
- Run the executable file.

Pass `--help` as a parameter to see command line options, which allow you to run this application without a `config.ini`.

## How to use
### With OBS
The following instructions uses default settings and under the scenario of running everything in the same computer.
Running this in a separate computer than Traktor is possible!

- Follow the installing instructions and get the application running.
- Place your video media files inside the `/media` folder, filename must be the same as the song filename loaded in Traktor. e.g. `Miku - Anamanaguchi.mp3` must be `Miku - Anamanaguchi.webm` or `Miku - Anamanaguchi.mp4`. Only `.webm` and `.mp4` is supported.
- Open Traktor Pro 3.
- Open OBS.
- Configure one scene per deck you want to handle in OBS and name it as `Deck {deck}`. e.g. `Deck A` and `Deck B`.
- Inside each scene create a browser source with any name, point it to the endpoint `/player/{deck}` and Page permissions to `Advanced access to OBS`. e.g. `http://localhost:8080/player/A` and `http://localhost:8080/player/B`
- Start mixing in Traktor Pro 3 and you will see how each scene displays each deck video in sync and the active scene transitions automatically based of Traktor crossfader.
- If you need to enable or disable the OBS automatic scene change when the program is running, while focused in the console press `E` to enable or press `D` to disable.

### Without OBS
- Follow the instructions above up to opening Traktor Pro 3.
- Point your browser to the endpoint `/player/{deck}`. e.g. `http://localhost:8080/player/A` or `http://localhost:8080/player/B`

## Developers
### Requirements
- Python 3.12+

### Running
- Clone or download the repository.
- Prepare a Python environment with all dependencies from `requirements.txt`.
- Enable debug with the `--debug` parameter or inside the `config.ini`.
- Run `main.py` inside the Python environment.

## Endpoints
The HTTP server contains these endpoints (By default at port 8080):

- `/media` - GET static video files with range request support.
- `/player/{deck}` - GET a HTML player for the deck.
- `/deck/{deck}` - GET deck data as JSON.
- `/channel/{channel}` - GET channel data as JSON.
- `/masterClock/` - GET master clock data as JSON.
- `/ws/` - GET the websocket server address and port as JSON.
- `/config/` - GET configuration required for HTML player.

The following is used by `traktor-api-client` and you should not send data manually or from other applications.
- `/deckLoaded/{deck}` - POST new deck loaded data from Traktor.
- `/updateDeck/{deck}` - POST deck data updates from Traktor.
- `/updateMasterClock` - POST master clock updates from Traktor.
- `/updateChannel/{channel}` - POST channel updates from Traktor.

The websocket server broadcasts all events from Traktor as `JSON` with the same name as the `POST` endpoints under the following format (By default at port 8081):

With `id` for `deckLoaded`, `updateDeck` and `updateChannel` events:
```
{ "event": "<EVENT NAME>", "id": "<ID OF DECK OR CHANNEL>", "data": <JSON DATA FROM TRAKTOR> }
```

Without `id` for `updateMasterClock` event:
```
{ "event": "<EVENT NAME SAME AS POST ENDPOINTS>", "data": <JSON DATA FROM TRAKTOR> }
```

Special broadcast for HTML player to toggle OBS automatic scene change at runtime:
```
{ "event": "toggleOBS", "status": "<enable/disable>" }
```

## Troubleshooting
If you receive errors about CORS and not having `Access-Control-Allow-Origin` header for the endpoint, be sure to modify `config.ini` to properly set `cors_domains`.

> A domain of `*` is set by default and will allow *ALL* domains to access data.

The HTTP server is the endpoint to receive data from `traktor-api-client`, be sure both address and port are configured in both sides accordingly.

If you have configured the application to run in another computer make sure the ports in the firewall are open in both sides.

## Credits
Based on the following repositories:
- https://github.com/vladkorotnev/traktor-obs-relay
- https://github.com/IRLToolkit/obs-websocket-http
