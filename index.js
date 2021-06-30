const clientId = "842112189618978897",
    DiscordRPC = require("discord-rpc"),
    iTunes = require("itunes-bridge"),
    getAppleMusicLink = require("get-apple-music-link"),
    AutoLaunch = require("auto-launch"),
    {app, Menu, Notification, Tray, BrowserWindow, dialog} = require("electron"),
    Store = require("electron-store"),
    { autoUpdater } = require("electron-updater"),
    path = require("path"),
    log = require('electron-log'),
    url = require('url');

const iTunesEmitter = iTunes.emitter,
    config = new Store({defaults: {
		autolaunch: true,
		show: true,
        hideOnPause: true
	}});

let rpc = new DiscordRPC.Client({ transport: "ipc" }),
    presenceData = {
        largeImageKey: "applemusic-logo",
        largeImageText: `AMRPC - V.${app.getVersion()}`
    },
    debugging = true;

console.log = log.log;

require('child_process').exec('NET SESSION', function(err,so,se) {
    let isAdmin = se.length === 0 ? true : false;
    if(isAdmin) {
        isQuiting = true;
        console.log("Please do not run AMRPC with administrator privileges!");
        dialog.showErrorBox("Oh no!", "Please do not run AMRPC with administrator privileges!");
        app.quit();
    }
});

iTunesEmitter.on("playing", async function(type, currentTrack) {
    if((currentTrack.mediaKind === 3 || currentTrack.mediaKind === 7) && currentTrack.album.length === 0)
        presenceData.details = `${currentTrack.name}`;
    else
        presenceData.details = `${currentTrack.name} - ${currentTrack.album}`;

    presenceData.state = (currentTrack) ? currentTrack.artist : "Unknown artist";

    if(currentTrack.duration > 0)
        presenceData.endTimestamp = Math.floor(Date.now() / 1000) - currentTrack.elapsedTime + currentTrack.duration;
    else {
        if(presenceData.endTimestamp) delete presenceData.endTimestamp;
        presenceData.details = currentTrack.name;
        presenceData.state = "LIVE";
    }

    if(currentTrack) {
        getAppleMusicLink.track(currentTrack.name, currentTrack.artist, function(res, err){
            if(!err){
                if(debugging) console.log(res);
                presenceData.buttons = [
                    {
                        label: "Play on Apple Music",
                        url: res
                    }
                ]
            }
        });
    }

    if(debugging) {
        console.log("action", "playing");
        console.log("type", type);
        console.log("currentTrack.name", currentTrack.name);
        console.log("currentTrack.artist", currentTrack.artist);
        console.log("currentTrack.album", currentTrack.album);
        console.log("timestamp", Math.floor(Date.now() / 1000) - currentTrack.elapsedTime + currentTrack.duration);
    }
});

iTunesEmitter.on("paused", async function(type, currentTrack) {
    if(config.get("hideOnPause")) {
        if(presenceData.details || presenceData.state || presenceData.endTimestamp || presenceData.buttons) rpc.clearActivity();
        delete presenceData.details;
        delete presenceData.state;
        delete presenceData.endTimestamp;
    } else {
        delete presenceData.endTimestamp;
        presenceData.state = "Paused";
    }

    if(debugging) {
        console.log("action", "paused");
        console.log("type", type);
        console.log("currentTrack.name", currentTrack.name);
        console.log("currentTrack.artist", currentTrack.artist);
        console.log("currentTrack.album", currentTrack.album);
    }
});

iTunesEmitter.on("stopped", async () => {
    if(debugging) console.log("action", "stopped");
    if(presenceData.details || presenceData.state || presenceData.endTimestamp || presenceData.buttons) rpc.clearActivity();
    delete presenceData.details;
    delete presenceData.state;
    delete presenceData.endTimestamp;
});

if(process.argv.find(element => element === "supporting")) {
    presenceData.buttons = [
        {
            label: "Download AMRPC",
            url: "https://github.com/N0chteil/Apple-Music-RPC"
        }
    ]
}

if(process.argv.find(element => element === "debugging")) debugging = true;
  
rpc.on("ready", () => {
    const currentTrack = iTunes.getCurrentTrack();

    updateChecker();
    if(currentTrack) {
        if((currentTrack.mediaKind === 3 || currentTrack.mediaKind === 7) && currentTrack.album.length === 0)
            presenceData.details = `${currentTrack.name}`;
        else
            presenceData.details = `${currentTrack.name} - ${currentTrack.album}`;

        presenceData.state = currentTrack.artist || "Unknown artist";

        if(currentTrack.duration === 0) {
            presenceData.details = currentTrack.name;
            presenceData.state = "LIVE";
        }
    }

    setInterval(() => {
        if(!presenceData?.details || !config.get("show")) return rpc.clearActivity();
        if(presenceData.details?.length > 128) presenceData.details = presenceData.details.substring(0,128);
        if(presenceData.state?.length > 128) presenceData.state = presenceData.state.substring(0,128);
        else if(presenceData.state?.length === 0) delete presenceData.state;

        rpc.setActivity(presenceData);
    }, 5);

    setInterval(() => {
        updateChecker();
    }, 600e3);
});

rpc.on("disconnected", () => {
    rpc = new DiscordRPC.Client({ transport: "ipc" });
    rpc.login({ clientId: clientId }).catch(() => rpc.destroy());
});

let mainWindow;

app.on("ready", () => {
    let tray = new Tray(path.join(app.isPackaged ? process.resourcesPath : __dirname, "/assets/logo.png")),
        isQuiting,
        autoLaunch = new AutoLaunch({
            name: "AMRPC",
            path: app.getPath("exe")
        }),
        cmenu = Menu.buildFromTemplate([
            { label: `AMRPC V${app.getVersion()}`, icon: path.join(app.isPackaged ? process.resourcesPath : __dirname, "/assets/tray/logo@18.png"), enabled: false },
            { type: "separator" },
            { label: "Reload AMRPC", click() { reloadAMRPC() } },
            { type: "separator" },
            { label: "Open Settings", click() { mainWindow.show() } },
            { type: "separator" },
            { label: "Quit", click() { isQuiting = true, app.quit() } }
          ]);

    app.on("quit", () => tray.destroy());
    app.on("before-quit", function () {
        isQuiting = true;
    });

    tray.setToolTip("AMRPC");
    tray.setContextMenu(cmenu);
    tray.on("right-click", () => tray.update());
    tray.on("click", () => mainWindow.show());

    if(config.get("autolaunch")) autoLaunch.enable();
    else autoLaunch.disable();

    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: path.join(app.isPackaged ? process.resourcesPath : __dirname, "/assets/logo.png"),
        frame: false,
        resizable: false
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname),
        protocol: "file:",
        slashes: true
    })+"/index.html");

    require('@electron/remote/main').initialize();

    mainWindow.on('close', function(event) {
        if(!isQuiting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.close();
});

function updateChecker() {
    console.log("Checking for updates...");

    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on("update-downloaded", () => autoUpdater.quitAndInstall());
}

function showNotification(title, body) {
    new Notification({title: title, body: body}).show();
}
  
function updateShowRPC(status) {
    if(status) {
        let ct = iTunes.getCurrentTrack();
        if(ct) {
            if((ct.mediaKind === 3 || ct.mediaKind === 7) && ct.album.length === 0) presenceData.details = `${ct.name}`;
            else presenceData.details = `${ct.name} - ${ct.album}`;

            presenceData.state = ct.artist;
            if(ct.duration > 0) presenceData.endTimestamp = Math.floor(Date.now() / 1000) - ct.elapsedTime + ct.duration;
            getAppleMusicLink.track(ct.name, ct.artist, function(res, err) {
                if(!err){
                    if(debugging) console.log(res);
                    presenceData.buttons = [
                        {
                            label: "Play on Apple Music",
                            url: res
                        }
                    ]
                }
            });

            if(debugging) {
                console.log("action", "update_cfg_show");
                console.log("currentTrack.name", ct.name);
                console.log("currentTrack.artist", ct.artist);
                console.log("currentTrack.album", ct.album);
                console.log("timestamp", Math.floor(Date.now() / 1000) - ct.elapsedTime + ct.duration);
            }
        }
    } else {
        rpc.clearActivity();
        delete presenceData.details;
        delete presenceData.state;
        delete presenceData.endTimestamp;
    }
    
    config.set("show", status);
}

async function reloadAMRPC() {
    rpc.destroy();
    
    if(config.get("show")) {
        let ct = iTunes.getCurrentTrack();
        if(ct) {
            if((ct.mediaKind === 3 || ct.mediaKind === 7) && ct.album.length === 0) presenceData.details = `${ct.name}`;
            else presenceData.details = `${ct.name} - ${ct.album}`;
                
            presenceData.state = ct.artist;
            if(ct.duration > 0) presenceData.endTimestamp = Math.floor(Date.now() / 1000) - ct.elapsedTime + ct.duration;
            getAppleMusicLink.track(ct.name, ct.artist, function(res, err) {
                if(!err){
                    if(debugging) console.log(res);
                    presenceData.buttons = [
                        {
                            label: "Play on Apple Music",
                            url: res
                        }
                    ]
                }
            });

            if(debugging) {
                console.log("action", "reload_amrpc");
                console.log("currentTrack.name", ct.name);
                console.log("currentTrack.artist", ct.artist);
                console.log("currentTrack.album", ct.album);
                console.log("timestamp", Math.floor(Date.now() / 1000) - ct.elapsedTime + ct.duration);
            }
        }
    }
}

rpc.login({ clientId: clientId }).catch(() => rpc.destroy());