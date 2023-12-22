// Handle if a video is playing
Object.defineProperty(HTMLMediaElement.prototype, 'playing', {
    get: function(){
        return !!(this.currentTime > 0 && !this.paused && !this.ended && this.readyState > 2);
    }
})

var MEDIA_URI;
var player;
var deckData = {};
var channelData = {};
var masterClockData = {};

// Very hackish way of getting the deck ID
var thisDeck = window.location.pathname.split("/").pop();
var thisChannel;

var wsInfo;
var config;

document.addEventListener("DOMContentLoaded", function(event) {
    console.log('Initializing player for deck ' + thisDeck + '.');

    // I know this is awkward but I have no idea how to await for each fetch.
    fetchDeckData('A').then(data => {
        deckData['A'] = JSON.parse(data);
        fetchDeckData('B').then(data => {
            deckData['B'] = JSON.parse(data);
            fetchDeckData('C').then(data => {
                deckData['C'] = JSON.parse(data);
                fetchDeckData('D').then(data => {
                    deckData['D'] = JSON.parse(data);
                    fetchChannelData('1').then(data => {
                        channelData['1'] = JSON.parse(data);
                        fetchChannelData('2').then(data => {
                            channelData['2'] = JSON.parse(data);
                            fetchChannelData('3').then(data => {
                                channelData['3'] = JSON.parse(data);
                                fetchChannelData('4').then(data => {
                                    channelData['4'] = JSON.parse(data);
                                        fetchWsInfo().then(data => {
                                            wsInfo = JSON.parse(data);
                                            fetchConfig().then(data => {
                                                config = JSON.parse(data);
                                                main();
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

async function fetchDeckData(deck) {
    fetchURL = location.protocol + '//' + location.host + '/deck/' + deck;
    const response = await fetch(fetchURL);
    if (!response.ok) {
        console.log('Initial deck data not loaded for deck ' + deck + ', deck is not initialized yet.');
        return JSON.stringify({})
    }
    const data = await response.text();
    console.log('Initial deck data loaded for deck ' + deck + '.');
    return data;
}

async function fetchChannelData(channel) {
    fetchURL = location.protocol + '//' + location.host + '/channel/' + channel;
    const response = await fetch(fetchURL);
    if (!response.ok) {
        console.log('Initial channel data not loaded for channel ' + channel + ', channel is not initialized yet.');
        return JSON.stringify({})
    }
    const data = await response.text();
    console.log('Initial channel data loaded for channel ' + channel + '.');
    return data;
}

async function fetchMasterClockData() {
    fetchURL = location.protocol + '//' + location.host + '/masterClock/';
    const response = await fetch(fetchURL);
    if (!response.ok) {
        console.log('Initial master clock data not loaded, it is not initialized yet.');
        return JSON.stringify({})
    }
    const data = await response.text();
    console.log('Initial master clock data loaded.');
    return data;
}

async function fetchWsInfo() {
    fetchURL = location.protocol + '//' + location.host + '/ws/';
    const response = await fetch(fetchURL);
    const data = await response.text();
    console.log('Websocket information obtained.')
    return data;
}

async function fetchConfig() {
    fetchURL = location.protocol + '//' + location.host + '/config/';
    const response = await fetch(fetchURL);
    const data = await response.text();
    console.log('Configuration information obtained.')
    return data;
}

function setChannel() {
    switch(thisDeck)
    {
        case config.channel_1:
            thisChannel = '1';
            break;
        case config.channel_2:
            thisChannel = '2';
            break;
        case config.channel_3:
            thisChannel = '3';
            break;
        case config.channel_4:
            thisChannel = '4';
            break;
        default:
            console.error('Channel cannot be handled for deck ' + thisDeck + '.');
            return;
    }
}

function main(){
    MEDIA_URI = config.media_uri;
    setChannel();
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
    player.id = thisDeck; // Not used but available
    document.getElementById('container').appendChild(player);
    return player;
}

function loadDeckVideo() {
    var filepath = deckData[thisDeck].filePath;
    if (filepath === "" || filepath === undefined)
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
    player.currentTime = deckData[thisDeck].elapsedTime;
    player.playbackRate = deckData[thisDeck].tempo;
    player.defaultPlaybackRate = deckData[thisDeck].tempo;
    if (deckData[thisDeck].isPlaying && !player.playing && player.readyState == HTMLMediaElement.HAVE_ENOUGH_DATA)
        // Every tick is checked for play status so if for any reason it fails here, then it will begin playing the next tick.
        player.play();
}

function checkCurrentScene() {
    var leftChannels = [];
    var rightChannels = [];
    var priorityChannelGroup = 'None';
    var xfaderAdjust = channelData[thisChannel].xfaderAdjust;

    for (let channelId in channelData) {
        var deckId = config['channel_' + channelId];
        var isPlaying = deckData[deckId].isPlaying;
        var isOnAir = channelData[channelId].isOnAir;
        if (isPlaying && isOnAir) {
            if (channelData[channelId].xfaderAssignLeft)
                leftChannels.push(channelId);
            if (channelData[channelId].xfaderAssignRight) 
                rightChannels.push(channelId);                
        }
    }

    if (leftChannels.length != 0)
        console.log('Left Channels Playing: ' + leftChannels);
    else
        console.log('Left Channels Playing: None');

    if (rightChannels.length != 0)
        console.log('Right Channels Playing: ' + rightChannels)
    else
        console.log('Right Channels Playing: None');

    if (xfaderAdjust < 0.5)
        priorityChannelGroup = 'Left';

    if (xfaderAdjust > 0.5)
        priorityChannelGroup = 'Right';

    let maxLeftVolume = 0;
    let maxLeftChannel = 'None';
    leftChannels.forEach((channelId) => {
        if(channelData[channelId].volume > maxLeftVolume) {
            maxLeftVolume  = channelData[channelId].volume;
            maxLeftChannel = channelId;
        }
    });

    let maxRightVolume = 0;
    let maxRightChannel = 'None';
    rightChannels.forEach((channelId) => {
        if(channelData[channelId].volume > maxRightVolume) {
            maxRightVolume  = channelData[channelId].volume;
            maxRightChannel = channelId;
        }
    });

    console.log('Priority Channel Group: ' + priorityChannelGroup);
    console.log('Priority Left Channel: ' + maxLeftChannel);
    console.log('Priority Right Channel: ' + maxRightChannel);

    var priorityChannel = 'None'

    if (priorityChannelGroup == 'Left') {
        if (maxLeftChannel != 'None')
            priorityChannel = maxLeftChannel;
        else if (maxRightChannel != 'None')
        {
            console.log('Left Channel is priority but setting current priority to Right Channel because there is nothing playing in Left Channel.');
            priorityChannel = maxRightChannel;
        }
    }

    if (priorityChannelGroup == 'Right') {
        if (maxRightChannel != 'None')
            priorityChannel = maxRightChannel;
        else if (maxLeftChannel != 'None')
        {
            console.log('Right Channel is priority but setting current priority to Left Channel because there is nothing playing in Right Channel.');
            priorityChannel = maxLeftChannel;
        }
    }

    if (priorityChannelGroup == 'None')
        if (maxRightChannel != 'None' && maxLeftChannel == 'None')
            priorityChannel = maxRightChannel;
        else if (maxLeftChannel != 'None' && maxRightChannel == 'None')
            priorityChannel = maxLeftChannel;
        else if (maxLeftChannel != 'None' && maxRightChannel != 'None')
            if (maxLeftVolume > maxRightVolume)
                priorityChannel = maxLeftChannel;
            else if (maxLeftVolume < maxRightVolume)
                priorityChannel = maxRightChannel;            

    if (priorityChannel != 'None') {
        deckId = config['channel_' + priorityChannel]
        console.log('Priority Channel is ' + priorityChannel + ' for Deck ' + deckId);
        
        if(window.obsstudio && config.auto_scene) {
            currentSceneName = window.obsstudio.getCurrentScene();
            sceneName = 'Deck ' + deckId;

            if (deckId == thisDeck && currentSceneName != sceneName)
                window.obsstudio.setCurrentScene(sceneName);
        }
    }
    else
        console.log('No Priority Channel to set as Current Scene.' );
}

function updateDeckData(id, data) {
    Object.keys(data).forEach(function(key) {
        deckData[id][key] = data[key];
    });
}

function updateChannelData(id, data) {
    Object.keys(data).forEach(function(key) {
        channelData[id][key] = data[key];
    });
}

function updateMasterClockData(data) {
    Object.keys(data).forEach(function(key) {
        masterClockData[key] = data[key];
    });
}

function processDeckLoaded(id, data) {
    updateDeckData(id, data);

    if (id != thisDeck) {
        console.log("Skipping video load, broadcast is for deck " + id + " and this is the player for deck " + thisDeck + ".");
        return;
    }
    loadDeckVideo();
    checkCurrentScene();
}

function processUpdateDeck(id, data) {
    updateDeckData(id, data);

    if (id != thisDeck) {
        console.log("Skipping processing deck update, broadcast is for deck " + id + " and this is the player for deck " + thisDeck + ".");
        return;
    }

    if (!player || player.readyState != HTMLMediaElement.HAVE_ENOUGH_DATA) {
        console.warn("Player without enough media data to process, skipping tick.")
        return;
    }

    if (!player.playing && deckData[thisDeck].isPlaying) {
        console.log("Player should be playing and is not, now playing.")
        player.play();
    }

    if (player.playing && !deckData[thisDeck].isPlaying) {
        console.log("Player should be paused and is not, now pausing.")
        player.pause();
    }

    if (player.playing && 
        deckData[thisDeck].elapsedTime && 
        Math.abs(deckData[thisDeck].elapsedTime - player.currentTime) > config.max_delay_ms/1000 &&
        deckData[thisDeck].elapsedTime < player.duration && deckData[thisDeck].elapsedTime > 0) {

        console.log("Desync of " + Math.abs(deckData[thisDeck].elapsedTime - player.currentTime)*1000 + "ms\nData time: " + deckData[thisDeck].elapsedTime + "s\nCurrent time: " + player.currentTime + "s");
        console.log("Resyncing...")
        player.currentTime = deckData[thisDeck].elapsedTime;
    }

    if (deckData[thisDeck].tempo != player.playbackRate) {
        player.playbackRate = deckData[thisDeck].tempo;
        player.defaultPlaybackRate = deckData[thisDeck].tempo;
    }

    checkCurrentScene();
}


function processUpdateChannel(id, data) {
    updateChannelData(id, data);
    checkCurrentScene();
}

function processMasterClock(data) {
    updateMasterClockData(data);

    // TODO - What do we even use this for?
}

function processToggleOBS(data) {
    var setStatus = data.status;

    if (setStatus == 'enable') {
        config.auto_scene = 1;
        console.log('OBS automatic scene change enabled.');
    }
    if (setStatus == 'disable') {
        config.auto_scene = 0;
        console.log('OBS automatic scene change disabled.');
    }
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
        case 'toggleOBS':
            processToggleOBS(jsonData.data);
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