const socket = io();

/* =====================================================
   GLOBAL
===================================================== */

let roomName = "";
let username = "";

let myId = null;
let isModerator = false;

let users = [];
let musicGroups = [];

let currentMusicGroupId = "main";

let localStream = null;

let muted = false;
let autoUnavailable = false;

let iceServers = [];

const peers = new Map();

/* =====================================================
   VOICE
===================================================== */

let audioContext = null;
let analyser = null;
let analyserBuffer = null;

let locallySpeaking = false;
let silenceSince = null;

/* =====================================================
   MAP
===================================================== */

let map = null;

let currentLatitude = null;
let currentLongitude = null;

let myMarker = null;

let selectedDestination = null;
let destinationMarker = null;
let routeLine = null;

/* =====================================================
   RIDE
===================================================== */

let ride = null;
let rideInterval = null;

/* =====================================================
   MUSIC
===================================================== */

let youtubePlayer = null;
let youtubeReady = false;

let applyingRemoteMusicState = false;
let musicRoomSwitching = false;
let musicStateReady = false;

let appliedGroupId = null;
let appliedVideoId = null;
let appliedListId = null;
let appliedPlaylistIndex = -1;

let youtubeInputDirty = false;

let manualMusicButton = null;
let manualMusicStatus = null;

/* =====================================================
   HELPERS
===================================================== */

const q = selector =>
    document.querySelector(selector);

function waitMs(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}

function getMe() {
    return users.find(
        user =>
            user.id === myId
    );
}

function getCurrentMusicGroup() {
    return musicGroups.find(
        group =>
            group.id ===
            currentMusicGroupId
    );
}

function canEditCurrentMusicGroup() {
    const group =
        getCurrentMusicGroup();

    if (!group) return false;

    return (
        group.ownerId === myId ||
        isModerator
    );
}

function canBroadcastCurrentMusicGroup() {
    const group =
        getCurrentMusicGroup();

    if (!group) return false;

    return (
        group.ownerId === myId &&
        !group.manualPaused &&
        group.playing &&
        !musicRoomSwitching &&
        musicStateReady &&
        !applyingRemoteMusicState
    );
}

/* =====================================================
   DOM
===================================================== */

const loginScreen = q("#loginScreen");
const app = q("#app");

const roomInput = q("#roomInput");
const usernameInput = q("#usernameInput");
const joinRoomButton = q("#joinRoomButton");
const loginStatus = q("#loginStatus");

const activeRoomName = q("#activeRoomName");
const connectionStatus = q("#connectionStatus");
const topSpeaking = q("#topSpeaking");

const rideTitle = q("#rideTitle");
const startRide = q("#startRide");
const rideTimer = q("#rideTimer");
const rideSearch = q("#rideSearch");
const rideLogs = q("#rideLogs");

const moderatorNavigation =
    q("#moderatorNavigation");

const destinationInput =
    q("#destinationInput");

const findDestinationButton =
    q("#findDestinationButton");

const destinationResults =
    q("#destinationResults");

const routeDestination =
    q("#routeDestination");

const routeDistance =
    q("#routeDistance");

const routeDuration =
    q("#routeDuration");

const centerLocationButton =
    q("#centerLocationButton");

const startNavigationButton =
    q("#startNavigationButton");

const navigationStatus =
    q("#navigationStatus");

const newMusicRoomName =
    q("#newMusicRoomName");

const createMusicRoom =
    q("#createMusicRoom");

const musicRooms =
    q("#musicRooms");

const currentMusicRoom =
    q("#currentMusicRoom");

const youtubeUrl =
    q("#youtubeUrl");

const loadYoutubeButton =
    q("#loadYoutubeButton");

const musicVolume =
    q("#musicVolume");

const duckVolume =
    q("#duckVolume");

const voiceThreshold =
    q("#voiceThreshold");

const voiceThresholdText =
    q("#voiceThresholdText");

const liveDbText =
    q("#liveDbText");

const muteButton =
    q("#muteButton");

const microphoneLevelBar =
    q("#microphoneLevelBar");

const microphoneDb =
    q("#microphoneDb");

const usersDiv =
    q("#users");

const moderatorName =
    q("#moderatorName");

const participantCount =
    q("#participantCount");

/* =====================================================
   SETTINGS
===================================================== */

const savedThreshold =
    localStorage.getItem(
        "rideroom-threshold"
    );

const savedVolume =
    localStorage.getItem(
        "rideroom-volume"
    );

const savedDuck =
    localStorage.getItem(
        "rideroom-duck"
    );

if (savedThreshold !== null) {
    voiceThreshold.value =
        savedThreshold;
}

if (savedVolume !== null) {
    musicVolume.value =
        savedVolume;
}

if (savedDuck !== null) {
    duckVolume.value =
        savedDuck;
}

voiceThresholdText.textContent =
    voiceThreshold.value +
    " dBFS";

/* =====================================================
   MANUAL MUSIC BUTTON
===================================================== */

function createManualMusicControls() {

    if (manualMusicButton) {
        return;
    }

    const youtubeElement =
        q("#youtubePlayer");

    if (!youtubeElement) {
        return;
    }

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.style.marginTop =
        "10px";

    wrapper.style.padding =
        "10px";

    wrapper.style.background =
        "#0d1117";

    wrapper.style.border =
        "1px solid #30363d";

    wrapper.style.borderRadius =
        "10px";

    wrapper.style.display =
        "flex";

    wrapper.style.flexDirection =
        "column";

    wrapper.style.gap =
        "8px";

    manualMusicButton =
        document.createElement(
            "button"
        );

    manualMusicButton.type =
        "button";

    manualMusicButton.style.width =
        "100%";

    manualMusicButton.style.minHeight =
        "48px";

    manualMusicButton.style.fontWeight =
        "700";

    manualMusicButton.style.fontSize =
        "16px";

    manualMusicButton.style.border =
        "none";

    manualMusicButton.style.borderRadius =
        "8px";

    manualMusicButton.style.cursor =
        "pointer";

    manualMusicStatus =
        document.createElement(
            "div"
        );

    manualMusicStatus.style.textAlign =
        "center";

    manualMusicStatus.style.fontSize =
        "13px";

    manualMusicStatus.style.opacity =
        "0.8";

    wrapper.appendChild(
        manualMusicButton
    );

    wrapper.appendChild(
        manualMusicStatus
    );

    youtubeElement
        .insertAdjacentElement(
            "afterend",
            wrapper
        );

    manualMusicButton.onclick =
        handleManualMusicButton;

    updateManualMusicButton();
}

function updateManualMusicButton() {

    if (
        !manualMusicButton ||
        !manualMusicStatus
    ) {
        return;
    }

    const group =
        getCurrentMusicGroup();

    if (!group) {

        manualMusicButton.disabled =
            true;

        manualMusicButton.textContent =
            "🎵 Müzik bekleniyor";

        return;
    }

    const hasMusic =
        Boolean(
            group.source ||
            group.currentVideoId ||
            group.listId
        );

    if (!hasMusic) {

        manualMusicButton.disabled =
            true;

        manualMusicButton.textContent =
            "🎵 Önce müzik yükle";

        manualMusicStatus.textContent =
            "Bu odacıkta henüz müzik yok.";

        return;
    }

    if (
        !canEditCurrentMusicGroup()
    ) {

        manualMusicButton.disabled =
            true;

        manualMusicButton.textContent =
            group.manualPaused
                ? "⏸ Müzik durduruldu"
                : "▶ Müzik çalıyor";

        manualMusicStatus.textContent =
            "Kontrol odacık sahibi / moderatörde.";

        return;
    }

    manualMusicButton.disabled =
        false;

    if (group.manualPaused) {

        manualMusicButton.textContent =
            "▶ MÜZİĞİ DEVAM ETTİR";

        manualMusicButton.style.background =
            "#238636";

        manualMusicButton.style.color =
            "#fff";

        manualMusicStatus.textContent =
            "Manuel durduruldu.";

    } else {

        manualMusicButton.textContent =
            "⏸ MÜZİĞİ DURDUR";

        manualMusicButton.style.background =
            "#da3633";

        manualMusicButton.style.color =
            "#fff";

        manualMusicStatus.textContent =
            group.listId
                ? "🎶 Mix / playlist aktif"
                : "🎵 Tek video aktif";
    }
}

async function handleManualMusicButton() {

    const group =
        getCurrentMusicGroup();

    if (
        !group ||
        !canEditCurrentMusicGroup()
    ) {
        return;
    }

    let position =
        Number(
            group.position || 0
        );

    try {

        const current =
            youtubePlayer
                ?.getCurrentTime?.();

        if (
            Number.isFinite(
                current
            )
        ) {

            position =
                current;
        }

    } catch {}

    if (!group.manualPaused) {

        applyingRemoteMusicState =
            true;

        musicStateReady =
            false;

        try {

            youtubePlayer
                ?.pauseVideo();

        } catch {}

        socket.emit(
            "music:setPaused",
            {
                paused: true,
                position
            }
        );

        group.manualPaused =
            true;

        group.playing =
            false;

        group.position =
            position;

        updateManualMusicButton();

        await waitMs(300);

        applyingRemoteMusicState =
            false;

        musicStateReady =
            true;

        return;
    }

    applyingRemoteMusicState =
        true;

    musicStateReady =
        false;

    socket.emit(
        "music:setPaused",
        {
            paused: false,
            position
        }
    );

    group.manualPaused =
        false;

    group.playing =
        true;

    group.position =
        position;

    updateManualMusicButton();

    try {

        youtubePlayer
            ?.seekTo(
                position,
                true
            );

        youtubePlayer
            ?.playVideo();

    } catch {}

    await waitMs(300);

    applyingRemoteMusicState =
        false;

    musicStateReady =
        true;
}

/* =====================================================
   YOUTUBE
===================================================== */

window.onYouTubeIframeAPIReady =
function () {

    youtubePlayer =
        new YT.Player(
            "youtubePlayer",
            {
                height:
                    "245",

                width:
                    "100%",

                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    playsinline: 1
                },

                events: {

                    onReady:
                        () => {

                            youtubeReady =
                                true;

                            createManualMusicControls();

                            updateDucking();

                            if (roomName) {

                                socket.emit(
                                    "music:getCurrentState"
                                );
                            }
                        },

                    onStateChange:
                        event => {

                            /*
                                YouTube kendi kendine bir sonraki
                                Mix parçasına geçtiğinde owner
                                yeni videoId + playlistIndex +
                                position bilgisini server'a yollar.
                            */

                            if (
                                applyingRemoteMusicState ||
                                musicRoomSwitching ||
                                !musicStateReady
                            ) {
                                return;
                            }

                            if (
                                event.data ===
                                    YT.PlayerState.PLAYING &&
                                canBroadcastCurrentMusicGroup()
                            ) {

                                sendMusicPlaybackState();
                            }

                            /*
                                ENDED geldiğinde YouTube playlist
                                varsa kendi sonraki şarkısına geçer.

                                Biz burada ilk videoyu yeniden
                                yüklemiyoruz.
                            */
                        },

                    onError:
                        event => {

                            console.warn(
                                "YouTube hata:",
                                event.data
                            );
                        }
                }
            }
        );
};

/* =====================================================
   INPUT
===================================================== */

youtubeUrl.addEventListener(
    "input",
    () => {

        youtubeInputDirty =
            true;
    }
);

/* =====================================================
   LOGIN
===================================================== */

joinRoomButton.onclick =
async () => {

    roomName =
        roomInput.value.trim();

    username =
        usernameInput.value.trim();

    if (
        !roomName ||
        !username
    ) {

        loginStatus.textContent =
            "Oda ve kullanıcı adı gerekli.";

        return;
    }

    joinRoomButton.disabled =
        true;

    loginStatus.textContent =
        "🎙️ Mikrofon hazırlanıyor...";

    try {

        const config =
            await fetch(
                "/api/config"
            ).then(
                response =>
                    response.json()
            );

        iceServers =
            config.iceServers;

        localStream =
            await navigator
                .mediaDevices
                .getUserMedia({

                    audio: {
                        echoCancellation:
                            true,

                        noiseSuppression:
                            true,

                        autoGainControl:
                            true
                    },

                    video:
                        false
                });

    } catch (error) {

        console.error(
            error
        );

        loginStatus.textContent =
            "Mikrofon açılamadı.";

        joinRoomButton.disabled =
            false;

        return;
    }

    setupMicrophoneHealth();

    socket.emit(
        "room:join",
        {
            roomName,
            username
        },
        result => {

            if (!result.ok) {

                loginStatus.textContent =
                    result.error;

                joinRoomButton.disabled =
                    false;

                return;
            }

            myId =
                result.id;

            isModerator =
                result.moderator;

            users =
                result.users;

            musicGroups =
                result.musicGroups;

            const me =
                getMe();

            currentMusicGroupId =
                me?.musicGroupId ||
                "main";

            musicRoomSwitching =
                true;

            musicStateReady =
                false;

            loginScreen
                .classList
                .add(
                    "hidden"
                );

            app
                .classList
                .remove(
                    "hidden"
                );

            activeRoomName.textContent =
                roomName;

            connectionStatus.textContent =
                "● Bağlı";

            connectionStatus.style.color =
                "#3fb950";

            setupModeratorUI();

            renderUsers();

            renderMusicGroups(true);

            createManualMusicControls();

            updateManualMusicButton();

            initializeMap();

            startVoiceEngine();

            startWebRTC(
                users
            );

            if (
                result.navigation
                    ?.destination
            ) {

                applyNavigation(
                    result.navigation
                );
            }

            if (result.ride) {

                startRideUI(
                    result.ride
                );
            }

            socket.emit(
                "ride:getLogs",
                ""
            );

            socket.emit(
                "music:getCurrentState"
            );
        }
    );
};

/* =====================================================
   MODERATOR
===================================================== */

function setupModeratorUI() {

    if (isModerator) {

        moderatorNavigation
            .classList
            .remove("hidden");

        rideTitle.disabled =
            false;

        startRide.disabled =
            false;

        startModeratorGPS();

    } else {

        moderatorNavigation
            .classList
            .add("hidden");

        rideTitle.disabled =
            true;

        startRide.disabled =
            true;
    }

    updateManualMusicButton();
}

/* =====================================================
   WEBRTC
===================================================== */

async function createPeer(
    peerId,
    initiator
) {

    if (
        peers.has(
            peerId
        )
    ) {

        return peers.get(
            peerId
        );
    }

    const pc =
        new RTCPeerConnection({
            iceServers
        });

    peers.set(
        peerId,
        pc
    );

    localStream
        .getTracks()
        .forEach(
            track => {

                pc.addTrack(
                    track,
                    localStream
                );
            }
        );

    pc.onicecandidate =
        event => {

            if (
                !event.candidate
            ) {
                return;
            }

            socket.emit(
                "webrtc:ice",
                {
                    target:
                        peerId,

                    candidate:
                        event.candidate
                }
            );
        };

    pc.ontrack =
        event => {

            let audio =
                document
                    .getElementById(
                        "audio-" +
                        peerId
                    );

            if (!audio) {

                audio =
                    document
                        .createElement(
                            "audio"
                        );

                audio.id =
                    "audio-" +
                    peerId;

                audio.autoplay =
                    true;

                audio.playsInline =
                    true;

                document
                    .querySelector(
                        "#remoteAudio"
                    )
                    .appendChild(
                        audio
                    );
            }

            audio.srcObject =
                event.streams[0];
        };

    if (initiator) {

        const offer =
            await pc
                .createOffer();

        await pc
            .setLocalDescription(
                offer
            );

        socket.emit(
            "webrtc:offer",
            {
                target:
                    peerId,

                sdp:
                    pc.localDescription
            }
        );
    }

    return pc;
}

function startWebRTC(list) {

    list
        .filter(
            user =>
                user.id !==
                myId
        )
        .forEach(
            user => {

                createPeer(
                    user.id,
                    true
                );
            }
        );
}

socket.on(
    "webrtc:offer",

    async ({
        from,
        sdp
    }) => {

        const pc =
            await createPeer(
                from,
                false
            );

        await pc
            .setRemoteDescription(
                sdp
            );

        const answer =
            await pc
                .createAnswer();

        await pc
            .setLocalDescription(
                answer
            );

        socket.emit(
            "webrtc:answer",
            {
                target:
                    from,

                sdp:
                    pc.localDescription
            }
        );
    }
);

socket.on(
    "webrtc:answer",

    async ({
        from,
        sdp
    }) => {

        const pc =
            peers.get(
                from
            );

        if (!pc) return;

        await pc
            .setRemoteDescription(
                sdp
            );
    }
);

socket.on(
    "webrtc:ice",

    async ({
        from,
        candidate
    }) => {

        const pc =
            peers.get(
                from
            );

        if (!pc) return;

        try {

            await pc
                .addIceCandidate(
                    candidate
                );

        } catch (error) {

            console.warn(
                "ICE:",
                error
            );
        }
    }
);

/* =====================================================
   USERS
===================================================== */

socket.on(
    "room:users",

    list => {

        users =
            list;

        const me =
            getMe();

        if (me) {

            const newGroupId =
                me.musicGroupId ||
                currentMusicGroupId;

            if (
                newGroupId !==
                currentMusicGroupId
            ) {

                currentMusicGroupId =
                    newGroupId;

                realMusicRoomChanged();
            }
        }

        renderUsers();

        renderMusicGroups(false);

        updateDucking();

        updateManualMusicButton();
    }
);

socket.on(
    "room:moderator",

    value => {

        isModerator =
            Boolean(value);

        setupModeratorUI();

        renderUsers();

        updateManualMusicButton();
    }
);

socket.on(
    "voice:speaking",

    ({
        id,
        speaking
    }) => {

        const user =
            users.find(
                item =>
                    item.id === id
            );

        if (user) {

            user.speaking =
                speaking;
        }

        renderUsers();

        updateDucking();
    }
);

/* =====================================================
   USER UI
===================================================== */

function renderUsers() {

    usersDiv.innerHTML =
        "";

    let modName =
        "-";

    const speakers =
        users.filter(
            user =>
                user.speaking &&
                !user.muted &&
                !user.autoUnavailable
        );

    if (
        speakers.length
    ) {

        topSpeaking.textContent =
            "🟢 KONUŞUYOR: " +
            speakers
                .map(
                    user =>
                        user.username
                )
                .join(" • ");

        topSpeaking
            .classList
            .add("active");

    } else {

        topSpeaking.textContent =
            "⚫ Konuşan yok";

        topSpeaking
            .classList
            .remove("active");
    }

    users.forEach(
        user => {

            if (
                user.moderator
            ) {

                modName =
                    user.username;
            }

            const div =
                document
                    .createElement(
                        "div"
                    );

            div.className =
                "user";

            if (
                user.speaking
            ) {

                div.classList
                    .add(
                        "speaking"
                    );
            }

            if (
                user.muted
            ) {

                div.classList
                    .add(
                        "muted-user"
                    );
            }

            if (
                user.background
            ) {

                div.classList
                    .add(
                        "background"
                    );
            }

            let status =
                "⚫ Dinliyor";

            if (
                user.autoUnavailable
            ) {

                status =
                    "⚠️ " +
                    escapeHtml(
                        user.username
                    ) +
                    " sizi şu anda duyamıyor ve konuşamıyor";

            } else if (
                user.muted
            ) {

                status =
                    "🔇 Mikrofon kapalı";

            } else if (
                user.speaking
            ) {

                status =
                    "🟢 Konuşuyor";

            } else if (
                user.background
            ) {

                status =
                    "🟡 Arka planda";
            }

            const group =
                musicGroups.find(
                    item =>
                        item.id ===
                        user.musicGroupId
                );

            div.innerHTML = `
                <div class="user-top">
                    <strong>
                        ${
                            user.id === myId
                                ? "👤 "
                                : ""
                        }

                        ${escapeHtml(
                            user.username
                        )}
                    </strong>

                    ${
                        user.moderator
                            ? `
                            <span class="mod-badge">
                                👑 MOD
                            </span>
                            `
                            : ""
                    }
                </div>

                <div class="user-status">
                    ${status}
                </div>

                <div class="user-status">
                    🎵
                    ${
                        group
                            ? escapeHtml(
                                group.name
                            )
                            : "-"
                    }
                </div>
            `;

            usersDiv
                .appendChild(
                    div
                );
        }
    );

    moderatorName.textContent =
        modName;

    participantCount.textContent =
        users.length;
}

/* =====================================================
   VOICE
===================================================== */

function startVoiceEngine() {

    audioContext =
        new AudioContext();

    const source =
        audioContext
            .createMediaStreamSource(
                localStream
            );

    analyser =
        audioContext
            .createAnalyser();

    analyser.fftSize =
        2048;

    source.connect(
        analyser
    );

    analyserBuffer =
        new Float32Array(
            analyser.fftSize
        );

    setInterval(
        analyseVoice,
        100
    );

    setInterval(
        () => {

            if (
                locallySpeaking &&
                socket.connected
            ) {

                socket.emit(
                    "voice:heartbeat"
                );
            }

        },
        500
    );
}

function analyseVoice() {

    if (
        !analyser ||
        !analyserBuffer
    ) {
        return;
    }

    analyser
        .getFloatTimeDomainData(
            analyserBuffer
        );

    let total = 0;

    for (
        let i = 0;
        i <
        analyserBuffer.length;
        i++
    ) {

        total +=
            analyserBuffer[i] *
            analyserBuffer[i];
    }

    const rms =
        Math.sqrt(
            total /
            analyserBuffer.length
        );

    const db =
        20 *
        Math.log10(
            Math.max(
                rms,
                0.000001
            )
        );

    const pretty =
        db.toFixed(1);

    microphoneDb.textContent =
        pretty +
        " dBFS";

    liveDbText.textContent =
        pretty +
        " dBFS";

    const meter =
        Math.max(
            0,
            Math.min(
                100,
                (
                    db +
                    90
                ) *
                1.12
            )
        );

    microphoneLevelBar
        .style.width =
        meter +
        "%";

    const threshold =
        Number(
            voiceThreshold.value
        );

    const shouldSpeak =
        !muted &&
        !autoUnavailable &&
        db >= threshold;

    if (
        shouldSpeak
    ) {

        silenceSince =
            null;

        if (
            !locallySpeaking
        ) {

            locallySpeaking =
                true;

            socket.emit(
                "voice:speaking",
                true
            );

            setMySpeaking(
                true
            );
        }

    } else if (
        locallySpeaking
    ) {

        if (
            silenceSince ===
            null
        ) {

            silenceSince =
                Date.now();
        }

        if (
            Date.now() -
            silenceSince >=
            600
        ) {

            locallySpeaking =
                false;

            silenceSince =
                null;

            socket.emit(
                "voice:speaking",
                false
            );

            setMySpeaking(
                false
            );
        }
    }
}

function setMySpeaking(value) {

    const me =
        getMe();

    if (me) {

        me.speaking =
            value;
    }

    renderUsers();

    updateDucking();
}

/* =====================================================
   MIC HEALTH
===================================================== */

function setupMicrophoneHealth() {

    const track =
        localStream
            .getAudioTracks()[0];

    if (!track) return;

    track.addEventListener(
        "mute",
        () => {

            if (muted) return;

            autoUnavailable =
                true;

            locallySpeaking =
                false;

            socket.emit(
                "voice:availability",
                {
                    unavailable:
                        true,

                    reason:
                        "Mikrofon işletim sistemi tarafından geçici olarak kullanılamıyor."
                }
            );

            socket.emit(
                "voice:speaking",
                false
            );

            updateDucking();
        }
    );

    track.addEventListener(
        "unmute",
        () => {

            autoUnavailable =
                false;

            socket.emit(
                "voice:availability",
                {
                    unavailable:
                        false,

                    reason:
                        null
                }
            );
        }
    );

    track.addEventListener(
        "ended",
        () => {

            autoUnavailable =
                true;

            locallySpeaking =
                false;

            socket.emit(
                "voice:availability",
                {
                    unavailable:
                        true,

                    reason:
                        "Mikrofon bağlantısı kesildi."
                }
            );

            socket.emit(
                "voice:speaking",
                false
            );
        }
    );
}

/* =====================================================
   MUTE
===================================================== */

muteButton.onclick =
() => {

    muted =
        !muted;

    localStream
        .getAudioTracks()
        .forEach(
            track => {

                track.enabled =
                    !muted;
            }
        );

    if (muted) {

        locallySpeaking =
            false;

        socket.emit(
            "voice:speaking",
            false
        );
    }

    socket.emit(
        "voice:muted",
        muted
    );

    muteButton.textContent =
        muted
            ? "🔇 Mikrofon Kapalı"
            : "🎙️ Mikrofon Açık";

    muteButton
        .classList
        .toggle(
            "muted",
            muted
        );
};

/* =====================================================
   SETTINGS
===================================================== */

voiceThreshold.oninput =
() => {

    voiceThresholdText.textContent =
        voiceThreshold.value +
        " dBFS";

    localStorage.setItem(
        "rideroom-threshold",
        voiceThreshold.value
    );
};

musicVolume.oninput =
() => {

    localStorage.setItem(
        "rideroom-volume",
        musicVolume.value
    );

    updateDucking();
};

duckVolume.oninput =
() => {

    localStorage.setItem(
        "rideroom-duck",
        duckVolume.value
    );

    updateDucking();
};

/* =====================================================
   DUCKING
===================================================== */

function updateDucking() {

    const someoneSpeaking =
        users.some(
            user =>
                user.speaking &&
                !user.muted &&
                !user.autoUnavailable
        );

    const target =
        someoneSpeaking
            ? Number(
                duckVolume.value
            )
            : Number(
                musicVolume.value
            );

    if (
        youtubePlayer &&
        youtubeReady
    ) {

        try {

            youtubePlayer
                .setVolume(
                    target
                );

        } catch {}
    }
}

/* =====================================================
   MUSIC GROUPS
===================================================== */

socket.on(
    "music:groups",

    groups => {

        musicGroups =
            groups;

        const me =
            getMe();

        if (me) {

            const newGroupId =
                me.musicGroupId ||
                currentMusicGroupId;

            if (
                newGroupId !==
                currentMusicGroupId
            ) {

                currentMusicGroupId =
                    newGroupId;

                realMusicRoomChanged();
            }
        }

        renderMusicGroups(
            false
        );

        renderUsers();

        updateManualMusicButton();
    }
);

/* =====================================================
   MUSIC ROOMS UI
===================================================== */

function renderMusicGroups(
    firstRender = false
) {

    musicRooms.innerHTML =
        "";

    musicGroups.forEach(
        group => {

            const item =
                document
                    .createElement(
                        "div"
                    );

            item.className =
                "music-room";

            if (
                group.id ===
                currentMusicGroupId
            ) {

                item.classList
                    .add(
                        "current"
                    );
            }

            const count =
                users.filter(
                    user =>
                        user.musicGroupId ===
                        group.id
                ).length;

            let stateText = "";

            if (
                group.manualPaused
            ) {

                stateText =
                    " · ⏸ Duraklatıldı";

            } else if (
                group.listId
            ) {

                stateText =
                    " · 🎶 Mix";

            } else if (
                group.playing
            ) {

                stateText =
                    " · ▶ Çalıyor";
            }

            item.innerHTML = `
                <div>
                    <strong>
                        🎵
                        ${escapeHtml(
                            group.name
                        )}
                    </strong>

                    <br>

                    <small>
                        ${count} kişi${stateText}
                    </small>
                </div>

                <button>
                    ${
                        group.id ===
                        currentMusicGroupId
                            ? "✓ İçindesin"
                            : "Katıl"
                    }
                </button>
            `;

            const button =
                item.querySelector(
                    "button"
                );

            button.onclick =
            () => {

                if (
                    group.id ===
                    currentMusicGroupId
                ) {
                    return;
                }

                saveCurrentMusicState();

                musicRoomSwitching =
                    true;

                musicStateReady =
                    false;

                applyingRemoteMusicState =
                    true;

                socket.emit(
                    "music:join",
                    group.id
                );
            };

            musicRooms
                .appendChild(
                    item
                );
        }
    );

    const current =
        getCurrentMusicGroup();

    currentMusicRoom.textContent =
        current?.name ||
        "-";

    if (
        firstRender &&
        current
    ) {

        youtubeInputDirty =
            false;

        youtubeUrl.value =
            current.source?.url ||
            "";
    }

    updateManualMusicButton();
}

/* =====================================================
   CREATE MUSIC ROOM
===================================================== */

createMusicRoom.onclick =
() => {

    const name =
        newMusicRoomName
            .value
            .trim();

    if (!name) {

        alert(
            "Odacık adı yaz."
        );

        return;
    }

    saveCurrentMusicState();

    musicRoomSwitching =
        true;

    musicStateReady =
        false;

    applyingRemoteMusicState =
        true;

    socket.emit(
        "music:create",
        name
    );

    newMusicRoomName.value =
        "";
};

/* =====================================================
   SAVE STATE
===================================================== */

function saveCurrentMusicState() {

    if (
        !roomName ||
        !youtubeReady ||
        !youtubePlayer
    ) {
        return;
    }

    const group =
        getCurrentMusicGroup();

    if (!group) return;

    if (
        group.ownerId !==
        myId
    ) {
        return;
    }

    try {

        const videoData =
            youtubePlayer
                .getVideoData?.() ||
            {};

        const currentVideoId =
            videoData.video_id ||
            group.currentVideoId ||
            group.source?.videoId ||
            null;

        const rawPlaylistIndex =
            youtubePlayer
                .getPlaylistIndex?.();

        const playlistIndex =
            Number.isFinite(
                rawPlaylistIndex
            ) &&
            rawPlaylistIndex >= 0
                ? rawPlaylistIndex
                : group.playlistIndex ||
                  0;

        const rawPosition =
            youtubePlayer
                .getCurrentTime?.();

        const position =
            Number.isFinite(
                rawPosition
            )
                ? rawPosition
                : group.position ||
                  0;

        socket.emit(
            "music:saveState",
            {
                groupId:
                    currentMusicGroupId,

                currentVideoId,

                listId:
                    group.source?.listId ||
                    group.listId ||
                    null,

                playlistIndex,

                position:
                    Math.max(
                        0,
                        position
                    )
            }
        );

    } catch (error) {

        console.warn(
            "State kaydedilemedi:",
            error
        );
    }
}

/* =====================================================
   ROOM CHANGE
===================================================== */

function realMusicRoomChanged() {

    musicRoomSwitching =
        true;

    musicStateReady =
        false;

    applyingRemoteMusicState =
        true;

    youtubeInputDirty =
        false;

    appliedGroupId =
        null;

    appliedVideoId =
        null;

    appliedListId =
        null;

    appliedPlaylistIndex =
        -1;

    if (
        youtubeReady &&
        youtubePlayer
    ) {

        try {

            youtubePlayer
                .stopVideo();

        } catch {}
    }

    const group =
        getCurrentMusicGroup();

    currentMusicRoom.textContent =
        group?.name ||
        "-";

    youtubeUrl.value =
        group?.source?.url ||
        "";

    updateManualMusicButton();

    socket.emit(
        "music:getCurrentState"
    );
}

/* =====================================================
   LOAD YOUTUBE
===================================================== */

loadYoutubeButton.onclick =
() => {

    const url =
        youtubeUrl
            .value
            .trim();

    if (!url) {

        alert(
            "YouTube linkini yapıştır."
        );

        return;
    }

    if (
        !canEditCurrentMusicGroup()
    ) {

        alert(
            "Bu müzik odacığını yalnız odacık sahibi veya moderatör değiştirebilir."
        );

        return;
    }

    const parsed =
        parseYoutubeUrl(
            url
        );

    if (
        !parsed.videoId &&
        !parsed.listId
    ) {

        alert(
            "YouTube linkini okuyamadım."
        );

        return;
    }

    youtubeInputDirty =
        false;

    musicRoomSwitching =
        true;

    musicStateReady =
        false;

    applyingRemoteMusicState =
        true;

    socket.emit(
        "music:setSource",
        {
            type:
                "youtube",

            url,

            videoId:
                parsed.videoId,

            listId:
                parsed.listId
        }
    );
};

/* =====================================================
   MUSIC STATE
===================================================== */

socket.on(
    "music:groupState",

    group => {

        if (
            !group ||
            group.id !==
                currentMusicGroupId
        ) {
            return;
        }

        const index =
            musicGroups.findIndex(
                item =>
                    item.id ===
                    group.id
            );

        if (
            index !== -1
        ) {

            musicGroups[index] = {
                ...musicGroups[index],
                ...group
            };
        }

        updateManualMusicButton();

        applyMusicGroupState(
            group
        );
    }
);

/* =====================================================
   APPLY MUSIC

   MIX / PLAYLIST İÇİN ANA DÜZELTME
===================================================== */

async function applyMusicGroupState(
    group
) {

    if (
        !youtubeInputDirty
    ) {

        youtubeUrl.value =
            group.source?.url ||
            "";
    }

    currentMusicRoom.textContent =
        group.name;

    updateManualMusicButton();

    if (
        !youtubeReady ||
        !youtubePlayer
    ) {
        return;
    }

    applyingRemoteMusicState =
        true;

    musicRoomSwitching =
        true;

    musicStateReady =
        false;

    const videoId =
        group.currentVideoId ||
        group.source?.videoId ||
        null;

    const listId =
        group.listId ||
        group.source?.listId ||
        null;

    const playlistIndex =
        Math.max(
            0,
            Number(
                group.playlistIndex ||
                0
            )
        );

    const targetPosition =
        Math.max(
            0,
            Number(
                group.position ||
                0
            )
        );

    if (
        !group.source &&
        !videoId &&
        !listId
    ) {

        try {

            youtubePlayer
                .stopVideo();

        } catch {}

        appliedGroupId =
            group.id;

        appliedVideoId =
            null;

        appliedListId =
            null;

        appliedPlaylistIndex =
            -1;

        finishMusicRoomSync();

        return;
    }

    try {

        /* =============================================
           MIX / PLAYLIST MODE
        ============================================= */

        if (listId) {

            let playerIndex = -1;
            let playerVideoId = null;

            try {

                playerIndex =
                    youtubePlayer
                        .getPlaylistIndex?.();

            } catch {}

            try {

                playerVideoId =
                    youtubePlayer
                        .getVideoData?.()
                        ?.video_id ||
                    null;

            } catch {}

            const playlistAlreadyCorrect =
                appliedGroupId ===
                    group.id &&
                appliedListId ===
                    listId &&
                Number(playerIndex) ===
                    playlistIndex &&
                (
                    !videoId ||
                    !playerVideoId ||
                    playerVideoId ===
                        videoId
                );

            if (
                !playlistAlreadyCorrect
            ) {

                const playlistOptions = {
                    listType:
                        "playlist",

                    list:
                        listId,

                    index:
                        playlistIndex,

                    startSeconds:
                        targetPosition
                };

                /*
                    KRİTİK:

                    Artık loadVideoById değil,
                    gerçek loadPlaylist kullanıyoruz.
                */

                if (
                    group.manualPaused ||
                    !group.playing
                ) {

                    youtubePlayer
                        .cuePlaylist(
                            playlistOptions
                        );

                } else {

                    youtubePlayer
                        .loadPlaylist(
                            playlistOptions
                        );
                }

                await waitMs(
                    650
                );

                try {

                    youtubePlayer
                        .seekTo(
                            targetPosition,
                            true
                        );

                } catch {}

                await waitMs(
                    350
                );
            }

            /*
                Server'ın play/pause kararı.
            */

            if (
                group.manualPaused ||
                !group.playing
            ) {

                try {

                    youtubePlayer
                        .pauseVideo();

                } catch {}

            } else {

                try {

                    youtubePlayer
                        .playVideo();

                } catch {}
            }

            appliedGroupId =
                group.id;

            appliedVideoId =
                videoId;

            appliedListId =
                listId;

            appliedPlaylistIndex =
                playlistIndex;

            await waitMs(
                300
            );

            finishMusicRoomSync();

            return;
        }

        /* =============================================
           NORMAL TEK VIDEO
        ============================================= */

        const changedGroup =
            appliedGroupId !==
            group.id;

        const changedVideo =
            appliedVideoId !==
            videoId;

        if (
            changedGroup ||
            changedVideo
        ) {

            if (videoId) {

                if (
                    group.manualPaused ||
                    !group.playing
                ) {

                    youtubePlayer
                        .cueVideoById({
                            videoId,
                            startSeconds:
                                targetPosition
                        });

                } else {

                    youtubePlayer
                        .loadVideoById({
                            videoId,
                            startSeconds:
                                targetPosition
                        });
                }
            }

            await waitMs(
                450
            );

            try {

                youtubePlayer
                    .seekTo(
                        targetPosition,
                        true
                    );

            } catch {}

            await waitMs(
                300
            );

        } else {

            const localPosition =
                Number(
                    youtubePlayer
                        .getCurrentTime?.() ||
                    0
                );

            if (
                Math.abs(
                    localPosition -
                    targetPosition
                ) > 3
            ) {

                youtubePlayer
                    .seekTo(
                        targetPosition,
                        true
                    );
            }
        }

        if (
            group.manualPaused ||
            !group.playing
        ) {

            youtubePlayer
                .pauseVideo();

        } else {

            youtubePlayer
                .playVideo();
        }

        appliedGroupId =
            group.id;

        appliedVideoId =
            videoId;

        appliedListId =
            null;

        appliedPlaylistIndex =
            0;

        await waitMs(
            300
        );

        finishMusicRoomSync();

    } catch (error) {

        console.warn(
            "YouTube sync:",
            error
        );

        finishMusicRoomSync();
    }
}

/* =====================================================
   FINISH SYNC
===================================================== */

function finishMusicRoomSync() {

    applyingRemoteMusicState =
        false;

    musicRoomSwitching =
        false;

    musicStateReady =
        true;

    updateDucking();

    updateManualMusicButton();
}

/* =====================================================
   OWNER MUSIC HEARTBEAT
===================================================== */

function sendMusicPlaybackState() {

    if (
        !roomName ||
        !youtubeReady ||
        !youtubePlayer ||
        !canBroadcastCurrentMusicGroup()
    ) {
        return;
    }

    const group =
        getCurrentMusicGroup();

    if (
        !group ||
        group.manualPaused ||
        !group.playing
    ) {
        return;
    }

    try {

        const videoData =
            youtubePlayer
                .getVideoData?.() ||
            {};

        const currentVideoId =
            videoData.video_id ||
            group.currentVideoId ||
            null;

        if (!currentVideoId) {
            return;
        }

        const rawPlaylistIndex =
            youtubePlayer
                .getPlaylistIndex?.();

        const playlistIndex =
            Number.isFinite(
                rawPlaylistIndex
            ) &&
            rawPlaylistIndex >= 0

                ? rawPlaylistIndex

                : group.playlistIndex ||
                  0;

        const rawPosition =
            youtubePlayer
                .getCurrentTime?.();

        if (
            !Number.isFinite(
                rawPosition
            )
        ) {
            return;
        }

        if (
            musicRoomSwitching ||
            !musicStateReady ||
            applyingRemoteMusicState
        ) {
            return;
        }

        /*
            Mix bir sonraki parçaya geçtiyse
            rawPosition 0 olabilir.

            Server yeni videoId/index gördüğü için
            bunu artık kabul edecek.
        */

        socket.emit(
            "music:syncState",
            {
                currentVideoId,

                listId:
                    group.source?.listId ||
                    group.listId ||
                    null,

                playlistIndex,

                position:
                    Math.max(
                        0,
                        rawPosition
                    )
            }
        );

    } catch {}
}

setInterval(
    () => {

        if (
            roomName &&
            canBroadcastCurrentMusicGroup()
        ) {

            sendMusicPlaybackState();
        }

    },
    1000
);

setInterval(
    () => {

        if (
            roomName &&
            musicStateReady &&
            !musicRoomSwitching &&
            !canBroadcastCurrentMusicGroup()
        ) {

            socket.emit(
                "music:getCurrentState"
            );
        }

    },
    4000
);

/* =====================================================
   YOUTUBE URL
===================================================== */

function parseYoutubeUrl(input) {

    try {

        const url =
            new URL(input);

        let videoId =
            null;

        const listId =
            url.searchParams
                .get("list");

        if (
            url.hostname
                .includes(
                    "youtu.be"
                )
        ) {

            videoId =
                url.pathname
                    .replace(
                        "/",
                        ""
                    );

        } else {

            videoId =
                url.searchParams
                    .get("v");

            if (
                !videoId &&
                url.pathname
                    .startsWith(
                        "/shorts/"
                    )
            ) {

                videoId =
                    url.pathname
                        .split("/")[2];
            }
        }

        return {
            videoId,
            listId
        };

    } catch {

        return {
            videoId: null,
            listId: null
        };
    }
}

/* =====================================================
   BACKGROUND
===================================================== */

document.addEventListener(
    "visibilitychange",

    async () => {

        if (!roomName) return;

        socket.emit(
            "user:background",
            document.hidden
        );

        if (
            document.hidden
        ) {

            saveCurrentMusicState();

            return;
        }

        try {

            if (
                audioContext &&
                audioContext.state ===
                    "suspended"
            ) {

                await audioContext
                    .resume();
            }

        } catch {}

        locallySpeaking =
            false;

        silenceSince =
            null;

        socket.emit(
            "voice:speaking",
            false
        );

        musicRoomSwitching =
            true;

        musicStateReady =
            false;

        applyingRemoteMusicState =
            true;

        socket.emit(
            "room:resync"
        );

        socket.emit(
            "music:getCurrentState"
        );

        setTimeout(
            updateDucking,
            300
        );
    }
);

window.addEventListener(
    "pagehide",

    () => {

        saveCurrentMusicState();
    }
);

/* =====================================================
   MAP
===================================================== */

function initializeMap() {

    map =
        L.map("map")
            .setView(
                [39, 35],
                6
            );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom:
                19,

            attribution:
                "© OpenStreetMap"
        }
    ).addTo(map);

    setTimeout(
        () => {

            map.invalidateSize();

        },
        300
    );
}

/* =====================================================
   GPS
===================================================== */

function startModeratorGPS() {

    if (
        !navigator.geolocation
    ) {
        return;
    }

    navigator
        .geolocation
        .watchPosition(

            position => {

                currentLatitude =
                    position.coords
                        .latitude;

                currentLongitude =
                    position.coords
                        .longitude;

                const coordinates = [
                    currentLatitude,
                    currentLongitude
                ];

                if (!myMarker) {

                    myMarker =
                        L.marker(
                            coordinates
                        )
                        .addTo(map)
                        .bindPopup(
                            "🏍️ Moderatör"
                        );

                    map.setView(
                        coordinates,
                        15
                    );

                } else {

                    myMarker
                        .setLatLng(
                            coordinates
                        );
                }
            },

            error => {

                console.warn(
                    "GPS:",
                    error
                );
            },

            {
                enableHighAccuracy:
                    true,

                maximumAge:
                    3000,

                timeout:
                    15000
            }
        );
}

/* =====================================================
   NAVIGATION SEARCH
===================================================== */

findDestinationButton.onclick =
    searchDestination;

destinationInput.onkeydown =
event => {

    if (
        event.key ===
        "Enter"
    ) {

        searchDestination();
    }
};

async function searchDestination() {

    if (!isModerator) return;

    const text =
        destinationInput
            .value
            .trim();

    if (!text) return;

    findDestinationButton.disabled =
        true;

    try {

        const url =
            "https://nominatim.openstreetmap.org/search" +
            "?format=json" +
            "&limit=8" +
            "&countrycodes=tr" +
            "&accept-language=tr" +
            "&q=" +
            encodeURIComponent(
                text
            );

        const results =
            await fetch(url)
                .then(
                    response =>
                        response.json()
                );

        destinationResults.innerHTML =
            "";

        destinationResults
            .classList
            .add("visible");

        if (!results.length) {

            destinationResults.innerHTML =
                `
                <div style="padding:10px">
                    Sonuç bulunamadı
                </div>
                `;

            return;
        }

        results.forEach(
            result => {

                const button =
                    document
                        .createElement(
                            "button"
                        );

                button.className =
                    "destination-result";

                button.textContent =
                    result.display_name;

                button.onclick =
                    () => {

                        chooseDestination(
                            result
                        );
                    };

                destinationResults
                    .appendChild(
                        button
                    );
            }
        );

    } catch (error) {

        console.error(
            error
        );

    } finally {

        findDestinationButton.disabled =
            false;
    }
}

async function chooseDestination(
    result
) {

    destinationResults
        .classList
        .remove("visible");

    const destination = {

        name:
            result.display_name,

        latitude:
            Number(result.lat),

        longitude:
            Number(result.lon)
    };

    let navigation = {

        destination,

        route: null,

        distance: null,

        duration: null
    };

    if (
        currentLatitude !== null &&
        currentLongitude !== null
    ) {

        navigation =
            await calculateRoute(
                destination
            );
    }

    socket.emit(
        "navigation:set",
        navigation
    );
}

/* =====================================================
   ROUTE
===================================================== */

async function calculateRoute(
    destination
) {

    navigationStatus.textContent =
        "🛣️ Rota hesaplanıyor...";

    try {

        const url =
            "https://router.project-osrm.org/route/v1/driving/" +
            currentLongitude +
            "," +
            currentLatitude +
            ";" +
            destination.longitude +
            "," +
            destination.latitude +
            "?overview=full" +
            "&geometries=geojson";

        const data =
            await fetch(url)
                .then(
                    response =>
                        response.json()
                );

        const route =
            data.routes?.[0];

        if (!route) {

            throw new Error(
                "Rota bulunamadı."
            );
        }

        return {

            destination,

            route:
                route.geometry,

            distance:
                route.distance,

            duration:
                route.duration
        };

    } catch (error) {

        console.warn(
            "Rota:",
            error
        );

        return {

            destination,

            route: null,

            distance: null,

            duration: null
        };
    }
}

/* =====================================================
   NAVIGATION UPDATE
===================================================== */

socket.on(
    "navigation:update",
    applyNavigation
);

function applyNavigation(
    navigation
) {

    if (
        !navigation
            ?.destination
    ) {
        return;
    }

    selectedDestination =
        navigation.destination;

    routeDestination.textContent =
        selectedDestination.name;

    startNavigationButton.disabled =
        false;

    if (destinationMarker) {

        map.removeLayer(
            destinationMarker
        );
    }

    destinationMarker =
        L.marker(
            [
                selectedDestination
                    .latitude,

                selectedDestination
                    .longitude
            ]
        )
        .addTo(map)
        .bindPopup(
            "🏁 " +
            selectedDestination.name
        );

    if (routeLine) {

        map.removeLayer(
            routeLine
        );

        routeLine = null;
    }

    if (
        navigation.route
    ) {

        const coordinates =
            navigation.route
                .coordinates
                .map(
                    point => [
                        point[1],
                        point[0]
                    ]
                );

        routeLine =
            L.polyline(
                coordinates,
                {
                    weight: 6,
                    opacity: 0.85
                }
            )
            .addTo(map);

        map.fitBounds(
            routeLine
                .getBounds(),
            {
                padding:
                    [20, 20]
            }
        );

    } else {

        map.setView(
            [
                selectedDestination
                    .latitude,

                selectedDestination
                    .longitude
            ],
            14
        );
    }

    routeDistance.textContent =
        navigation.distance != null

            ? (
                navigation.distance /
                1000
            ).toFixed(1) +
            " km"

            : "--";

    routeDuration.textContent =
        navigation.duration != null

            ? formatRouteTime(
                navigation.duration
            )

            : "--";

    navigationStatus.textContent =
        "✅ Ortak hedef hazır";
}

/* =====================================================
   GOOGLE MAPS
===================================================== */

startNavigationButton.onclick =
() => {

    if (
        !selectedDestination
    ) {
        return;
    }

    const destination =
        selectedDestination.latitude +
        "," +
        selectedDestination.longitude;

    const url =
        "https://www.google.com/maps/dir/?api=1" +
        "&destination=" +
        encodeURIComponent(
            destination
        ) +
        "&travelmode=driving" +
        "&dir_action=navigate";

    window.open(
        url,
        "_blank"
    );
};

centerLocationButton.onclick =
() => {

    if (
        currentLatitude === null
    ) {
        return;
    }

    map.setView(
        [
            currentLatitude,
            currentLongitude
        ],
        16
    );
};

/* =====================================================
   RIDE
===================================================== */

startRide.onclick =
() => {

    if (!isModerator) return;

    if (!ride) {

        const title =
            rideTitle
                .value
                .trim();

        if (!title) {

            alert(
                "Sürüş başlığı yaz."
            );

            return;
        }

        socket.emit(
            "ride:start",
            {
                title,

                destination:
                    selectedDestination
                        ?.name ||
                    null
            }
        );

    } else {

        socket.emit(
            "ride:end"
        );
    }
};

socket.on(
    "ride:started",
    startRideUI
);

function startRideUI(data) {

    ride =
        data;

    rideTitle.value =
        data.title;

    startRide.textContent =
        "■ Sürüşü Sonlandır";

    clearInterval(
        rideInterval
    );

    const update =
        () => {

            const seconds =
                Math.floor(
                    (
                        Date.now() -
                        ride.startedAt
                    ) /
                    1000
                );

            rideTimer.textContent =
                formatClock(
                    seconds
                );
        };

    update();

    rideInterval =
        setInterval(
            update,
            1000
        );
}

socket.on(
    "ride:ended",
    () => {

        ride = null;

        clearInterval(
            rideInterval
        );

        rideTimer.textContent =
            "00:00:00";

        startRide.textContent =
            "▶ Sürüşü Başlat";

        socket.emit(
            "ride:getLogs",
            rideSearch.value
        );
    }
);

socket.on(
    "ride:logs",
    logs => {

        if (!logs.length) {

            rideLogs.innerHTML =
                "Henüz kayıt yok";

            return;
        }

        rideLogs.innerHTML =
            "";

        logs.forEach(
            log => {

                const div =
                    document
                        .createElement(
                            "div"
                        );

                div.className =
                    "ride-log";

                const duration =
                    Math.floor(
                        (
                            log.duration ||
                            0
                        ) /
                        1000
                    );

                div.innerHTML = `
                    <strong>
                        🏍️
                        ${escapeHtml(
                            log.title
                        )}
                    </strong>

                    <br>

                    ⏱️
                    ${formatRideDuration(
                        duration
                    )}

                    ${
                        log.destination
                            ? `
                            <br>
                            🏁
                            ${escapeHtml(
                                log.destination
                            )}
                            `
                            : ""
                    }

                    <br>

                    <small>
                        ${new Date(
                            log.started_at
                        ).toLocaleString(
                            "tr-TR"
                        )}
                    </small>
                `;

                rideLogs
                    .appendChild(
                        div
                    );
            }
        );
    }
);

rideSearch.oninput =
() => {

    socket.emit(
        "ride:getLogs",
        rideSearch.value
    );
};

/* =====================================================
   CONNECTION
===================================================== */

socket.on(
    "disconnect",
    () => {

        connectionStatus.textContent =
            "● Bağlantı yok";

        connectionStatus.style.color =
            "#f85149";
    }
);

socket.on(
    "connect",
    () => {

        if (!roomName) return;

        connectionStatus.textContent =
            "● Bağlı";

        connectionStatus.style.color =
            "#3fb950";

        musicRoomSwitching =
            true;

        musicStateReady =
            false;

        applyingRemoteMusicState =
            true;

        socket.emit(
            "room:resync"
        );

        socket.emit(
            "music:getCurrentState"
        );
    }
);

/* =====================================================
   FORMAT
===================================================== */

function formatClock(seconds) {

    const h =
        Math.floor(
            seconds / 3600
        );

    const m =
        Math.floor(
            (
                seconds % 3600
            ) / 60
        );

    const s =
        seconds % 60;

    return [
        h,
        m,
        s
    ]
    .map(
        value =>
            String(value)
                .padStart(
                    2,
                    "0"
                )
    )
    .join(":");
}

function formatRideDuration(
    seconds
) {

    const h =
        Math.floor(
            seconds / 3600
        );

    const m =
        Math.floor(
            (
                seconds % 3600
            ) / 60
        );

    if (h) {

        return (
            h +
            " saat " +
            m +
            " dakika"
        );
    }

    if (m) {

        return (
            m +
            " dakika"
        );
    }

    return (
        seconds +
        " saniye"
    );
}

function formatRouteTime(
    seconds
) {

    const minutes =
        Math.round(
            seconds / 60
        );

    if (
        minutes < 60
    ) {

        return (
            minutes +
            " dk"
        );
    }

    return (
        Math.floor(
            minutes / 60
        ) +
        " sa " +
        (
            minutes % 60
        ) +
        " dk"
    );
}

function escapeHtml(text) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(
            text ?? ""
        );

    return div.innerHTML;
}