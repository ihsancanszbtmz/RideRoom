require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    pingInterval: 10000,
    pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =====================================================
   DATABASE
===================================================== */

const db = new Database("rideroom.db");

db.exec(`
CREATE TABLE IF NOT EXISTS rides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    title TEXT NOT NULL,
    destination TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration INTEGER
);
`);

const rooms = new Map();

/* =====================================================
   MUSIC
===================================================== */

function createMusicGroup(id, name, ownerId = null) {
    return {
        id,
        name,
        ownerId,

        source: null,

        currentVideoId: null,
        listId: null,
        playlistIndex: 0,

        position: 0,

        playing: false,
        manualPaused: false,

        updatedAt: Date.now()
    };
}

function getRoom(roomName) {
    if (!rooms.has(roomName)) {

        const musicGroups = new Map();

        musicGroups.set(
            "main",
            createMusicGroup(
                "main",
                "Ana Moderatör Müziği"
            )
        );

        rooms.set(roomName, {
            users: new Map(),
            moderatorId: null,

            musicGroups,

            navigation: {
                destination: null,
                route: null,
                distance: null,
                duration: null
            },

            ride: null
        });
    }

    return rooms.get(roomName);
}

function getMusicGroupMembers(room, groupId) {
    return Array
        .from(room.users.values())
        .filter(
            user =>
                user.musicGroupId === groupId
        );
}

function groupHasMusic(group) {
    return Boolean(
        group.source ||
        group.currentVideoId ||
        group.listId
    );
}

function getEffectivePosition(group) {
    let position =
        Number(group.position || 0);

    if (
        group.playing &&
        group.updatedAt
    ) {
        position += Math.max(
            0,
            (
                Date.now() -
                group.updatedAt
            ) / 1000
        );
    }

    return position;
}

function freezeMusicGroup(group) {
    group.position =
        getEffectivePosition(group);

    group.playing = false;
    group.updatedAt = Date.now();
}

function resumeMusicGroup(group) {
    if (!groupHasMusic(group)) {
        group.playing = false;
        return;
    }

    if (group.manualPaused) {
        group.playing = false;
        return;
    }

    group.playing = true;
    group.updatedAt = Date.now();
}

function enforceGroupPlaying(room, group) {
    const memberCount =
        getMusicGroupMembers(
            room,
            group.id
        ).length;

    if (group.manualPaused) {

        if (group.playing) {
            freezeMusicGroup(group);
        }

        return;
    }

    if (
        memberCount > 0 &&
        groupHasMusic(group)
    ) {

        if (!group.playing) {
            group.playing = true;
            group.updatedAt = Date.now();
        }

    } else if (
        memberCount === 0 &&
        group.playing
    ) {

        freezeMusicGroup(group);
    }
}

/* =====================================================
   PUBLIC STATE
===================================================== */

function publicUsers(room) {
    return Array
        .from(room.users.values())
        .map(user => ({
            id: user.id,
            username: user.username,

            moderator: user.moderator,

            speaking: user.speaking,
            muted: user.muted,
            background: user.background,

            autoUnavailable:
                user.autoUnavailable,

            unavailableReason:
                user.unavailableReason,

            musicGroupId:
                user.musicGroupId
        }));
}

function musicSnapshot(room, group) {
    enforceGroupPlaying(
        room,
        group
    );

    return {
        ...group,

        position:
            getEffectivePosition(
                group
            ),

        updatedAt:
            Date.now()
    };
}

function publicMusicGroups(room) {
    return Array
        .from(room.musicGroups.values())
        .map(
            group =>
                musicSnapshot(
                    room,
                    group
                )
        );
}

function sendRoomState(roomName) {
    const room =
        rooms.get(roomName);

    if (!room) return;

    io.to(roomName).emit(
        "room:users",
        publicUsers(room)
    );

    io.to(roomName).emit(
        "music:groups",
        publicMusicGroups(room)
    );
}

function sendMusicStateToGroup(
    room,
    group
) {
    const snapshot =
        musicSnapshot(
            room,
            group
        );

    const members =
        getMusicGroupMembers(
            room,
            group.id
        );

    for (const user of members) {
        io.to(user.id).emit(
            "music:groupState",
            snapshot
        );
    }
}

/* =====================================================
   UPDATE PLAYBACK STATE

   MIX için kritik bölüm.
===================================================== */

function applyIncomingMusicState(
    group,
    state
) {
    const incomingVideoId =
        state.currentVideoId ||
        null;

    const incomingIndex =
        Math.max(
            0,
            Number(
                state.playlistIndex || 0
            )
        );

    const oldVideoId =
        group.currentVideoId;

    const oldIndex =
        Number(
            group.playlistIndex || 0
        );

    /*
        KRİTİK:

        Mix bir sonraki parçaya geçtiyse,
        0 saniye tamamen normaldir.

        Eski "0 saniyeyi engelle" korumasını
        bu durumda uygulamıyoruz.
    */
    const trackChanged =
        (
            incomingVideoId &&
            oldVideoId &&
            incomingVideoId !== oldVideoId
        ) ||
        incomingIndex !== oldIndex;

    if (incomingVideoId) {
        group.currentVideoId =
            incomingVideoId;
    }

    if (
        state.listId !== undefined
    ) {
        group.listId =
            state.listId;
    }

    group.playlistIndex =
        incomingIndex;

    const incomingPosition =
        Number(
            state.position
        );

    if (
        Number.isFinite(
            incomingPosition
        ) &&
        incomingPosition >= 0
    ) {

        if (trackChanged) {

            /*
                Yeni şarkı:
                0.0 saniye kabul edilir.
            */
            group.position =
                incomingPosition;

            group.updatedAt =
                Date.now();

        } else {

            /*
                Aynı şarkı:
                iframe geçici 0 gönderirse
                eski zamanı koru.
            */
            if (
                !(
                    group.position > 3 &&
                    incomingPosition < 1
                )
            ) {
                group.position =
                    incomingPosition;

                group.updatedAt =
                    Date.now();
            }
        }
    }
}

/* =====================================================
   ICE
===================================================== */

app.get(
    "/api/config",
    (req, res) => {

        const iceServers = [
            {
                urls:
                    "stun:stun.l.google.com:19302"
            }
        ];

        if (process.env.TURN_URL) {
            iceServers.push({
                urls:
                    process.env.TURN_URL,

                username:
                    process.env.TURN_USERNAME,

                credential:
                    process.env.TURN_PASSWORD
            });
        }

        res.json({
            iceServers
        });
    }
);

/* =====================================================
   SOCKET.IO
===================================================== */

io.on("connection", socket => {

    console.log(
        "Bağlandı:",
        socket.id
    );

    /* =================================================
       JOIN
    ================================================= */

    socket.on(
        "room:join",
        (
            {
                roomName,
                username
            },
            callback
        ) => {

            roomName =
                String(
                    roomName || ""
                ).trim();

            username =
                String(
                    username || ""
                ).trim();

            if (
                !roomName ||
                !username
            ) {
                callback({
                    ok: false,
                    error:
                        "Oda adı ve kullanıcı adı gerekli."
                });

                return;
            }

            const room =
                getRoom(roomName);

            socket.join(roomName);

            socket.data.roomName =
                roomName;

            socket.data.username =
                username;

            if (!room.moderatorId) {
                room.moderatorId =
                    socket.id;
            }

            const moderator =
                room.moderatorId ===
                socket.id;

            const mainGroup =
                room.musicGroups.get(
                    "main"
                );

            const mainWasEmpty =
                getMusicGroupMembers(
                    room,
                    "main"
                ).length === 0;

            const user = {
                id: socket.id,
                username,
                moderator,

                speaking: false,
                speakingExpiresAt: 0,

                muted: false,
                background: false,

                autoUnavailable: false,
                unavailableReason: null,

                musicGroupId: "main"
            };

            room.users.set(
                socket.id,
                user
            );

            if (mainWasEmpty) {
                mainGroup.ownerId =
                    socket.id;

                resumeMusicGroup(
                    mainGroup
                );
            }

            callback({
                ok: true,

                id: socket.id,
                moderator,

                users:
                    publicUsers(room),

                musicGroups:
                    publicMusicGroups(
                        room
                    ),

                navigation:
                    room.navigation,

                ride:
                    room.ride
            });

            sendRoomState(
                roomName
            );

            sendMusicStateToGroup(
                room,
                mainGroup
            );
        }
    );

    /* =================================================
       WEBRTC
    ================================================= */

    socket.on(
        "webrtc:offer",
        ({ target, sdp }) => {

            io.to(target).emit(
                "webrtc:offer",
                {
                    from: socket.id,
                    sdp
                }
            );
        }
    );

    socket.on(
        "webrtc:answer",
        ({ target, sdp }) => {

            io.to(target).emit(
                "webrtc:answer",
                {
                    from: socket.id,
                    sdp
                }
            );
        }
    );

    socket.on(
        "webrtc:ice",
        ({
            target,
            candidate
        }) => {

            io.to(target).emit(
                "webrtc:ice",
                {
                    from: socket.id,
                    candidate
                }
            );
        }
    );

    /* =================================================
       VOICE
    ================================================= */

    socket.on(
        "voice:speaking",
        speaking => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            if (
                user.muted ||
                user.autoUnavailable
            ) {

                user.speaking =
                    false;

                user.speakingExpiresAt =
                    0;

            } else if (speaking) {

                user.speaking =
                    true;

                user.speakingExpiresAt =
                    Date.now() +
                    1700;

            } else {

                user.speaking =
                    false;

                user.speakingExpiresAt =
                    0;
            }

            io.to(
                socket.data.roomName
            ).emit(
                "voice:speaking",
                {
                    id:
                        socket.id,

                    speaking:
                        user.speaking
                }
            );
        }
    );

    socket.on(
        "voice:heartbeat",
        () => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            if (
                user.speaking &&
                !user.muted &&
                !user.autoUnavailable
            ) {

                user.speakingExpiresAt =
                    Date.now() +
                    1700;
            }
        }
    );

    socket.on(
        "voice:muted",
        muted => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            user.muted =
                Boolean(muted);

            if (user.muted) {
                user.speaking =
                    false;

                user.speakingExpiresAt =
                    0;
            }

            sendRoomState(
                socket.data.roomName
            );
        }
    );

    socket.on(
        "voice:availability",
        data => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            user.autoUnavailable =
                Boolean(
                    data?.unavailable
                );

            user.unavailableReason =
                data?.reason ||
                null;

            if (
                user.autoUnavailable
            ) {

                user.speaking =
                    false;

                user.speakingExpiresAt =
                    0;
            }

            sendRoomState(
                socket.data.roomName
            );
        }
    );

    socket.on(
        "user:background",
        background => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            user.background =
                Boolean(background);

            sendRoomState(
                socket.data.roomName
            );
        }
    );

    /* =================================================
       RESYNC
    ================================================= */

    socket.on(
        "room:resync",
        () => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            socket.emit(
                "room:users",
                publicUsers(room)
            );

            socket.emit(
                "music:groups",
                publicMusicGroups(room)
            );

            const user =
                room.users.get(
                    socket.id
                );

            if (user) {

                const group =
                    room.musicGroups.get(
                        user.musicGroupId
                    );

                if (group) {

                    socket.emit(
                        "music:groupState",
                        musicSnapshot(
                            room,
                            group
                        )
                    );
                }
            }

            socket.emit(
                "navigation:update",
                room.navigation
            );

            if (room.ride) {

                socket.emit(
                    "ride:started",
                    room.ride
                );
            }
        }
    );

    /* =================================================
       CREATE MUSIC ROOM
    ================================================= */

    socket.on(
        "music:create",
        name => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            name =
                String(
                    name || ""
                ).trim();

            if (!name) return;

            const oldGroupId =
                user.musicGroupId;

            const oldGroup =
                room.musicGroups.get(
                    oldGroupId
                );

            const oldMembers =
                getMusicGroupMembers(
                    room,
                    oldGroupId
                );

            if (
                oldGroup &&
                oldMembers.length === 1
            ) {

                freezeMusicGroup(
                    oldGroup
                );

                oldGroup.ownerId =
                    null;

            } else if (
                oldGroup &&
                oldGroup.ownerId ===
                    socket.id
            ) {

                const replacement =
                    oldMembers.find(
                        member =>
                            member.id !==
                            socket.id
                    );

                if (replacement) {

                    oldGroup.ownerId =
                        replacement.id;
                }
            }

            const id =
                "music-" +
                Date.now()
                    .toString(36) +
                "-" +
                Math.random()
                    .toString(36)
                    .slice(2, 8);

            const newGroup =
                createMusicGroup(
                    id,
                    name,
                    socket.id
                );

            room.musicGroups.set(
                id,
                newGroup
            );

            user.musicGroupId =
                id;

            sendRoomState(
                socket.data.roomName
            );

            socket.emit(
                "music:groupState",
                musicSnapshot(
                    room,
                    newGroup
                )
            );
        }
    );

    /* =================================================
       SAVE MUSIC STATE
    ================================================= */

    socket.on(
        "music:saveState",
        state => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const group =
                room.musicGroups.get(
                    state?.groupId
                );

            if (!group) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            const allowed =
                group.ownerId ===
                    socket.id ||
                user.moderator;

            if (!allowed) return;

            applyIncomingMusicState(
                group,
                state
            );

            enforceGroupPlaying(
                room,
                group
            );
        }
    );

    /* =================================================
       MANUAL PAUSE / PLAY
    ================================================= */

    socket.on(
        "music:setPaused",
        data => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            const group =
                room.musicGroups.get(
                    user.musicGroupId
                );

            if (!group) return;

            const allowed =
                group.ownerId ===
                    socket.id ||
                user.moderator;

            if (!allowed) return;

            const paused =
                Boolean(
                    data?.paused
                );

            const incomingPosition =
                Number(
                    data?.position
                );

            if (
                Number.isFinite(
                    incomingPosition
                ) &&
                incomingPosition >= 0
            ) {

                group.position =
                    incomingPosition;

            } else {

                group.position =
                    getEffectivePosition(
                        group
                    );
            }

            group.updatedAt =
                Date.now();

            if (paused) {

                group.manualPaused =
                    true;

                group.playing =
                    false;

            } else {

                group.manualPaused =
                    false;

                const memberCount =
                    getMusicGroupMembers(
                        room,
                        group.id
                    ).length;

                group.playing =
                    memberCount > 0 &&
                    groupHasMusic(
                        group
                    );

                group.updatedAt =
                    Date.now();
            }

            sendMusicStateToGroup(
                room,
                group
            );

            io.to(
                socket.data.roomName
            ).emit(
                "music:groups",
                publicMusicGroups(
                    room
                )
            );
        }
    );

    /* =================================================
       JOIN MUSIC ROOM
    ================================================= */

    socket.on(
        "music:join",
        groupId => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            if (
                user.musicGroupId ===
                groupId
            ) {
                return;
            }

            const newGroup =
                room.musicGroups.get(
                    groupId
                );

            if (!newGroup) return;

            const oldGroupId =
                user.musicGroupId;

            const oldGroup =
                room.musicGroups.get(
                    oldGroupId
                );

            const oldMembers =
                getMusicGroupMembers(
                    room,
                    oldGroupId
                );

            if (
                oldGroup &&
                oldMembers.length === 1
            ) {

                freezeMusicGroup(
                    oldGroup
                );

                oldGroup.ownerId =
                    null;

            } else if (
                oldGroup &&
                oldGroup.ownerId ===
                    socket.id
            ) {

                const replacement =
                    oldMembers.find(
                        member =>
                            member.id !==
                            socket.id
                    );

                if (replacement) {

                    oldGroup.ownerId =
                        replacement.id;
                }
            }

            const newMembersBefore =
                getMusicGroupMembers(
                    room,
                    groupId
                );

            const newRoomWasEmpty =
                newMembersBefore.length ===
                0;

            user.musicGroupId =
                groupId;

            if (newRoomWasEmpty) {

                newGroup.ownerId =
                    socket.id;

                resumeMusicGroup(
                    newGroup
                );

            } else {

                enforceGroupPlaying(
                    room,
                    newGroup
                );
            }

            sendRoomState(
                socket.data.roomName
            );

            sendMusicStateToGroup(
                room,
                newGroup
            );
        }
    );

    /* =================================================
       SET SOURCE
    ================================================= */

    socket.on(
        "music:setSource",
        source => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            const group =
                room.musicGroups.get(
                    user.musicGroupId
                );

            if (!group) return;

            const allowed =
                group.ownerId ===
                    socket.id ||
                user.moderator;

            if (!allowed) return;

            group.source = {
                type:
                    "youtube",

                url:
                    String(
                        source?.url ||
                        ""
                    ),

                videoId:
                    source?.videoId ||
                    null,

                listId:
                    source?.listId ||
                    null
            };

            group.currentVideoId =
                source?.videoId ||
                null;

            group.listId =
                source?.listId ||
                null;

            group.playlistIndex =
                0;

            group.position =
                0;

            group.manualPaused =
                false;

            group.updatedAt =
                Date.now();

            enforceGroupPlaying(
                room,
                group
            );

            sendMusicStateToGroup(
                room,
                group
            );

            io.to(
                socket.data.roomName
            ).emit(
                "music:groups",
                publicMusicGroups(
                    room
                )
            );
        }
    );

    /* =================================================
       LIVE MUSIC SYNC
    ================================================= */

    socket.on(
        "music:syncState",
        state => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            const group =
                room.musicGroups.get(
                    user.musicGroupId
                );

            if (!group) return;

            if (
                group.ownerId !==
                socket.id
            ) {
                return;
            }

            applyIncomingMusicState(
                group,
                state
            );

            enforceGroupPlaying(
                room,
                group
            );

            sendMusicStateToGroup(
                room,
                group
            );
        }
    );

    /* =================================================
       CURRENT MUSIC
    ================================================= */

    socket.on(
        "music:getCurrentState",
        () => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            const group =
                room.musicGroups.get(
                    user.musicGroupId
                );

            if (!group) return;

            enforceGroupPlaying(
                room,
                group
            );

            socket.emit(
                "music:groupState",
                musicSnapshot(
                    room,
                    group
                )
            );
        }
    );

    /* =================================================
       NAVIGATION
    ================================================= */

    socket.on(
        "navigation:set",
        navigation => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            if (
                room.moderatorId !==
                socket.id
            ) {
                return;
            }

            room.navigation =
                navigation;

            io.to(
                socket.data.roomName
            ).emit(
                "navigation:update",
                navigation
            );
        }
    );

    /* =================================================
       RIDE START
    ================================================= */

    socket.on(
        "ride:start",
        ({
            title,
            destination
        }) => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            if (
                room.moderatorId !==
                    socket.id ||
                room.ride
            ) {
                return;
            }

            title =
                String(
                    title || ""
                ).trim();

            if (!title) return;

            const startedAt =
                Date.now();

            const result =
                db.prepare(`
                    INSERT INTO rides
                    (
                        room,
                        title,
                        destination,
                        started_at
                    )
                    VALUES (?, ?, ?, ?)
                `).run(
                    socket.data.roomName,
                    title,
                    destination || null,
                    startedAt
                );

            room.ride = {
                id:
                    Number(
                        result.lastInsertRowid
                    ),

                title,

                destination:
                    destination ||
                    null,

                startedAt
            };

            io.to(
                socket.data.roomName
            ).emit(
                "ride:started",
                room.ride
            );
        }
    );

    /* =================================================
       RIDE END
    ================================================= */

    socket.on(
        "ride:end",
        () => {

            const room =
                rooms.get(
                    socket.data.roomName
                );

            if (!room) return;

            if (
                room.moderatorId !==
                    socket.id ||
                !room.ride
            ) {
                return;
            }

            const endedAt =
                Date.now();

            const duration =
                endedAt -
                room.ride.startedAt;

            db.prepare(`
                UPDATE rides

                SET
                    ended_at = ?,
                    duration = ?

                WHERE id = ?
            `).run(
                endedAt,
                duration,
                room.ride.id
            );

            const completed = {
                ...room.ride,
                endedAt,
                duration
            };

            room.ride = null;

            io.to(
                socket.data.roomName
            ).emit(
                "ride:ended",
                completed
            );
        }
    );

    /* =================================================
       RIDE LOGS
    ================================================= */

    socket.on(
        "ride:getLogs",
        search => {

            const roomName =
                socket.data.roomName;

            if (!roomName) return;

            search =
                String(
                    search || ""
                ).trim();

            let rows;

            if (search) {

                rows =
                    db.prepare(`
                        SELECT *
                        FROM rides

                        WHERE
                            room = ?
                            AND
                            (
                                title LIKE ?
                                OR
                                destination LIKE ?
                            )

                        ORDER BY
                            started_at DESC

                        LIMIT 100
                    `).all(
                        roomName,
                        `%${search}%`,
                        `%${search}%`
                    );

            } else {

                rows =
                    db.prepare(`
                        SELECT *
                        FROM rides

                        WHERE room = ?

                        ORDER BY
                            started_at DESC

                        LIMIT 100
                    `).all(
                        roomName
                    );
            }

            socket.emit(
                "ride:logs",
                rows
            );
        }
    );

    /* =================================================
       DISCONNECT
    ================================================= */

    socket.on(
        "disconnect",
        () => {

            const roomName =
                socket.data.roomName;

            if (!roomName) return;

            const room =
                rooms.get(
                    roomName
                );

            if (!room) return;

            const user =
                room.users.get(
                    socket.id
                );

            if (!user) return;

            const groupId =
                user.musicGroupId;

            const group =
                room.musicGroups.get(
                    groupId
                );

            const groupMembers =
                getMusicGroupMembers(
                    room,
                    groupId
                );

            if (
                group &&
                groupMembers.length === 1
            ) {

                freezeMusicGroup(
                    group
                );

                group.ownerId =
                    null;

            } else if (
                group &&
                group.ownerId ===
                    socket.id
            ) {

                const replacement =
                    groupMembers.find(
                        member =>
                            member.id !==
                            socket.id
                    );

                if (replacement) {

                    group.ownerId =
                        replacement.id;
                }
            }

            room.users.delete(
                socket.id
            );

            if (
                room.moderatorId ===
                socket.id
            ) {

                for (
                    const remainingUser
                    of
                    room.users.values()
                ) {

                    remainingUser.moderator =
                        false;
                }

                const next =
                    room.users
                        .keys()
                        .next()
                        .value ||
                    null;

                room.moderatorId =
                    next;

                if (next) {

                    const nextUser =
                        room.users.get(
                            next
                        );

                    if (nextUser) {

                        nextUser.moderator =
                            true;
                    }

                    io.to(next).emit(
                        "room:moderator",
                        true
                    );
                }
            }

            for (
                const musicGroup
                of
                room.musicGroups.values()
            ) {

                enforceGroupPlaying(
                    room,
                    musicGroup
                );
            }

            sendRoomState(
                roomName
            );
        }
    );
});

/* =====================================================
   SPEAKING FAILSAFE
===================================================== */

setInterval(
    () => {

        const now =
            Date.now();

        for (
            const [
                roomName,
                room
            ]
            of
            rooms.entries()
        ) {

            let changed =
                false;

            for (
                const user
                of
                room.users.values()
            ) {

                if (
                    user.speaking &&
                    user.speakingExpiresAt &&
                    now >
                        user.speakingExpiresAt
                ) {

                    user.speaking =
                        false;

                    user.speakingExpiresAt =
                        0;

                    changed =
                        true;
                }
            }

            if (changed) {

                io.to(
                    roomName
                ).emit(
                    "room:users",
                    publicUsers(
                        room
                    )
                );
            }
        }

    },
    500
);

/* =====================================================
   START
===================================================== */

server.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "🏍️ RideRoom server çalışıyor"
        );

        console.log(
            `🌐 http://localhost:${PORT}`
        );

        console.log(
            "🎶 YouTube Mix / playlist geçiş desteği AKTİF"
        );

        console.log(
            "⏸️ Manuel durdurma AKTİF"
        );

        console.log(
            "▶️ Kaldığı yerden devam AKTİF"
        );

        console.log(
            "========================================"
        );

        console.log("");
    }
);