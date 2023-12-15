// Handle if a video is playing
Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
    get: function(){
        return !!(this.currentTime > 0 && !this.paused && !this.ended && this.readyState > 2);
    }
})

const MEDIA_URI = "../media/";
var player;
var deckData;
var channelData;
var masterClockData;

// Very hackish way of getting the deck ID
var deck = window.location.pathname.split("/").pop();
var channel;
var onAir = false;

var wsInfo;

document.addEventListener("DOMContentLoaded", function(event) {
    console.log('Initializing player for deck ' + deck);
    console.log('Fetching initial deck data...');

    // I know this is awkward but I have no idea how to await for each fetch.
    fetchDeckData(deck).then(data => {
        deckData = JSON.parse(data);
        fetchChannelData(deck).then(data => {
            channelData = JSON.parse(data);
            fetchWsInfo().then(data => {
                wsInfo = JSON.parse(data);
                fetchMasterClockData().then(data => {
                    masterClockData = JSON.parse(data);
                    main();
                });
            });
        });
    });
});

async function fetchDeckData(deck) {
    fetchURL = location.protocol + '//' + location.host + '/deck/' + deck;
    const response = await fetch(fetchURL);
    if (!response.ok) {
        console.log('Initial deck data not loaded, deck is not initialized yet.');
        return JSON.stringify({})
    }
    const data = await response.json();
    console.log('Initial deck data loaded.');
    return data;
}

async function fetchChannelData(deck) {
    switch(deck)
    {
        case 'A':
            channel = 1;
            break;
        case 'B':
            channel = 2;
            break;
        case 'C':
            channel = 3;
            break;
        case 'D':
            channel = 4;
            break;
        default:
            console.error('Channel cannot be handled for deck ' + deck);
            return;
    }

    fetchURL = location.protocol + '//' + location.host + '/channel/' + channel;
    const response = await fetch(fetchURL);
    if (!response.ok) {
        console.log('Initial channel data not loaded, deck is not initialized yet.');
        return JSON.stringify({})
    }
    const data = await response.json();
    console.log('Initial channel data loaded.');
    return data;
}

async function fetchMasterClockData() {
    fetchURL = location.protocol + '//' + location.host + '/masterClock/' + deck;
    const response = await fetch(fetchURL);
    if (!response.ok) {
        console.log('Initial master clock data not loaded, it is not initialized yet.');
        return JSON.stringify({})
    }
    const data = await response.json();
    console.log('Initial master clock data loaded.');
    return data;
}

async function fetchWsInfo() {
    fetchURL = location.protocol + '//' + location.host + '/ws/';
    const response = await fetch(fetchURL);
    const data = await response.json();
    console.log('Websocket information obtained.')
    return data;
}

function main(){
    player = createPlayer();                
    loadDeckVideo();
    checkCurrentScene();
    url = 'ws://' + wsInfo.address + ':' + wsInfo.port;
    let wsClient;
    startWsClient(()=>{
        wsClient = new WebSocket(url)
        return wsClient;
    });
}

function createPlayer() {
    console.log('Creating player video element.');
    player = document.createElement('video');
    player.muted = true;
    player.autoplay = false;
    player.id = deck; // Not used but available
    document.getElementById('container').appendChild(player);
    return player;
}

function loadDeckVideo() {
    var filepath = deckData.filePath;
    if (filepath == undefined)
    {
        console.log('Deck has no filepath yet, not loading video.');
        return;
    }
    console.log('Loading video for filepath: ' + filepath);
    var filenameextension = filepath.replace(/^.*[\\\/]/, '');
    var filename = filenameextension.substring(0, filenameextension.lastIndexOf('.'));
    console.log('Loading video for filename: ' + filename);
    
    var mediapathfilename = MEDIA_URI + filename;
    // If both extensions exist, '.webm' will load first.
    const extensions = [".webm", ".mp4"];
    for (i = 0; i < extensions.length; i++) {
        var mediapath = mediapathfilename + extensions[i];
        console.log("Searching for media file: " + mediapath);
        if(player.getAttribute("src") === mediapath){
            console.log("Same video file is already loaded, no need to reload, skipping.");
            break;
        }
        if(doesFileExist(mediapath)){
            player.setAttribute("src", mediapath);
            player.load();
            break;
        }
    }
    player.currentTime = deckData.elapsedTime;
    player.playbackRate = deckData.tempo;
    player.defaultPlaybackRate = deckData.tempo;
    if (deckData.isPlaying && !player.playing)
        // This is so fast we don't even need to check for 'HTMLMediaElement.HAVE_ENOUGH_DATA'.
        // Every tick is checked for play status so if for any reason it fails here, then it will begin playing the next tick.
        player.play();
}

function checkCurrentScene() {
    sceneName = 'Deck ' + deck;
    currentSceneName = window.obsstudio.getCurrentScene();
    if (sceneName != currentSceneName && onAir)
        window.obsstudio.setCurrentScene('Deck ' + deck);

    /*  TODO FIX - This may require a PR for https://github.com/ErikMinekus/traktor-api-client
        'isOnAir' as TRUE is broadcasted for every channel that is LIVE at Traktor.
        So a fighting between scenes may occur at startup if there are multiple 'onAir'.    
    */
}

function updateDeckData(data) {
    Object.keys(data).forEach(function(key) {
        deckData[key] = data[key];
    });
}

function updateChannelData(data) {
    Object.keys(data).forEach(function(key) {
        channelData[key] = data[key];
    });
}

function updateMasterClockData(data) {
    Object.keys(data).forEach(function(key) {
        masterClockData[key] = data[key];
    });
}

function processDeckLoaded(id, data) {
    if (id != deck) {
        console.log("Skipping this broadcast, it's for deck " + id + " and this is the player for deck " + deck + ".");
        return;
    }
    updateDeckData(data);
    loadDeckVideo();
}

function processUpdateDeck(id, data) {
    if (id != deck) {
        console.log("Skipping this broadcast, it's for deck " + id + " and this is the player for deck " + deck + ".");
        return;
    }
    updateDeckData(data);

    if (!player || player.readyState != HTMLMediaElement.HAVE_ENOUGH_DATA) {
        console.warn("Player without enough media data to process, skipping tick.")
        return;
    }

    if (!player.playing && deckData.isPlaying && player.readyState == HTMLMediaElement.HAVE_ENOUGH_DATA) {
        console.log("Player should be playing and is not, now playing.")
        player.play();
    }

    if (player.playing && !deckData.isPlaying && player.readyState == HTMLMediaElement.HAVE_ENOUGH_DATA) {
        console.log("Player should be paused and is not, now pausing.")
        player.pause();
    }

    // Allow a maximum of 300ms of desync
    var driftSeconds = 0.3

    if (player.playing && 
        deckData.elapsedTime && 
        Math.abs(deckData.elapsedTime - player.currentTime) > driftSeconds &&
        deckData.elapsedTime < player.duration && deckData.elapsedTime > 0) {

        console.log("Desync of " + Math.abs(deckData.elapsedTime - player.currentTime)*1000 + "ms\nData time: " + deckData.elapsedTime + "s\nCurrent time: " + player.currentTime + "s");
        console.log("Resyncing...")
        player.currentTime = deckData.elapsedTime;
    }

    if (deckData.tempo != player.playbackRate) {
        player.playbackRate = deckData.tempo;
        player.defaultPlaybackRate = deckData.tempo;
    }
}


function processUpdateChannel(id, data) {
    if (id != channel) {
        console.log("Skipping this broadcast, it's for channel " + id + " and this is the player for channel " + channel + ".");
        return;
    }
    updateChannelData(data);

    if (onAir != channelData.isOnAir) {
        onAir = channelData.isOnAir
        if (onAir)
            window.obsstudio.setCurrentScene('Deck ' + deck);
    }

    /*  TODO FIX - This may require a PR for https://github.com/ErikMinekus/traktor-api-client
        The latest channel to broadcast 'isOnAir' as TRUE will be the active OBS scene.
        A better way to handle this would be to know the value of the crossfader and set the
        current scene if it's 60% or higher towards the channel but this data is not being
        sent by the 'traktor-api-client'.
    */
}

function processMasterClock(data) {
    updateMasterClockData(data);

    // TODO - What do we even use this for?
}

function processWsData(data)
{
    console.log('Processing Websocket data...')
    jsonData = JSON.parse(data);
    console.log(jsonData)

    eventName = jsonData.event;

    switch(eventName)
    {
        case 'deckLoaded':
            processDeckLoaded(jsonData.id, jsonData.data);
            break;
        case 'updateDeck':
            processUpdateDeck(jsonData.id, jsonData.data);
            break;
        case 'updateChannel':
            processUpdateChannel(jsonData.id, jsonData.data);
            break;
        case 'updateMasterClock':
            processMasterClock(jsonData.data);
            break;
        default:
            console.error('Event ' + eventName + ' not recognized.');
            break;
    }
}

function defineWebsocketEvents(ws) {
      
    ws.onmessage = function(e) {
        console.log('Websocket message received.');
        processWsData(e.data);
    };
    
    ws.onerror = function() {
        console.error('Websocket error.');
        ws.close();
    };
}

function startWsClient(ws_create){
    let ws = ws_create();
    function startReconnecting(){
        let interval = setInterval(()=>{
            console.log('Websocket connection closed.\nReconnecting...');
            ws = ws_create();
            ws.onopen = () => {
                console.log('Websocket connection open.');
                ws.onclose = startReconnecting;
                defineWebsocketEvents(ws);
                clearInterval(interval);
            }
        }, 3000);
    }
    ws.onclose = startReconnecting;
    defineWebsocketEvents(ws);
}

// Check if URI file exist
function doesFileExist(urlToFile)
{
    var xhr = new XMLHttpRequest();
    xhr.open('HEAD', urlToFile, false);
    xhr.send();
    if (xhr.readyState == 4 && xhr.status == 404 ) {
        console.log("File doesn't exist: " + urlToFile);
        return false;
    } else {
        console.log("File found: " + urlToFile);
        return true;
    }
}