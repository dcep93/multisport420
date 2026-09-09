# Phone remote

On the viewing screen, choose streams, enter an optional room ID in **Options → Phone
remote**, and press **Join**. A blank ID is the default room. Joining always
publishes the viewer's current lineup and spotlight, replacing any existing room
state. **Open remote** and **Share link** provide the phone URL.

`/remote` connects to the default room; `/remote/:roomId` connects to a named room.
The phone loads only the controls, not the stream catalog, players, or game logs.
Tap a bubble to spotlight its stream; tap the spotlight again to toggle mute.
**Refresh spotlight log** matches the viewer's `0` shortcut. Mute uses the same
existing player/extension integration as the keyboard; the remote reports a
command sent rather than claiming to know the player's actual audio state.

Viewers in the same room share their ordered streams, spotlight, and log visibility.
Keyboard shortcuts and viewer controls update the room too. Mutations use Firebase
transactions so a phone selection doesn't overwrite simultaneous lineup changes.
The default room uses its own encoded key, distinct from every named room.
Rooms persist after **Leave**; tab presence is removed on disconnect. Leave and
unmount explicitly close that tab's Firebase socket, stopping SDK keepalives.
Joining again opens a new connection. The remote
disables controls while disconnected or while no viewer is connected. Initial
connection/reconnection treats the stored command as a baseline, so an old mute
or log-refresh command is not replayed.

The viewer's existing password gate stays; the remote has no gate, login, or
pairing. Room reads and writes are public, as requested.

## Existing Firebase project

The app reuses the `multisport420` Firebase project serving
https://multisport420.web.app. It fetches Firebase Hosting's
reserved `/__/firebase/init.json` endpoint and initializes the modular Firebase SDK
with that configuration. No separate project or paid plan is required. The current
Hosting deployment already rewrites routes to `/index.html`, including `/remote`.

One-time setup, if Realtime Database is not already enabled:

1. Open the **existing** Hosting project in Firebase Console and create its
   Realtime Database. The configuration returned by `/__/firebase/init.json` must
   include its `databaseURL`. Link a Web App to the Hosting site if needed.
2. Add the following child inside the existing database's `rules` object:

   ```json
   "remoteRooms": { ".read": true, ".write": true }
   ```

   Preserve rules for other data in the shared project. `app/database.rules.json`
   contains this branch for a database with no other rules and for emulator tests;
   the Hosting deployment intentionally does not overwrite the shared database's
   existing rules.
3. Verify Join and open the generated remote link on another device.

Only small room snapshots and control changes are sent through Firebase. Video and
game logs are not stored there. There is no polling loop; tab presence uses
Realtime Database's connection and `onDisconnect` support.

For local development, copy `app/.env.example` to `app/.env.local` and supply that
same project's web configuration. For isolated tests, use a `demo-` project and
the local database emulator instead.

## Verification

From `app`, run `npm ci`, `npm test`, `npm run lint`, and `npm run build`.
For the browser integration tests, start the isolated emulator in one terminal:

```sh
firebase emulators:start --only database --project demo-multisport420 --config firebase.emulator.json
```

Then run `npx playwright install chromium` and `npm run test:remote` in another.
The browser suite starts Vite with a demo-only Firebase configuration. It mocks
the stream provider and ESPN, uses the real local Realtime Database, and checks
default/named rooms, Join overwrites, two viewers, phone and keyboard actions,
presence, and the phone layout. It never writes to a live Firebase project.
