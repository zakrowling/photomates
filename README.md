# Photomates

A group photobooth for remote mates, in the style of Teams' Together Mode. Everyone joins a booth from their own computer, their camera background is removed, and the whole group sits together in one scene. Press the shutter, everyone gets a 3-2-1 countdown, and out comes a group photo to download. Try it at **https://zakrowling.github.io/photomates/** or jump straight into the shared booth at **https://zakrowling.github.io/photomates/mate**.

- **Background removal in your own browser**: [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)'s selfie segmenter finds you in every camera frame, and a face detector keeps everyone framed the same way (head near the top, shoulders at the bottom, faces the same size), so the group looks right together.
- **Scenes**:
  - **Theatre**: tiered wooden benches, like a lecture hall.
  - **Stadium**: rows of blue stadium seats.
  - **Brady Bunch**: everyone in their own square on a grid that grows with the group.
  In the theatre and stadium, the bench or row of seats in front of you hides your lower half, so everyone looks like they're really sitting there. Anyone can switch scenes or shuffle the seats, and everyone sees the change.
- **The photo**: anyone can press **Take photo**. Everyone sees the same countdown and flash. At the shutter, each browser takes a full-quality picture of its own person and sends it to everyone else, and every browser puts together the same high-resolution group photo (2560×1440 PNG) to download. The live preview can be low resolution, but the photo isn't.
- **Up to 12 mates** per booth. Someone without a camera (or who has wandered off) shows as a silhouette in their colour.
- **Rooms**: create a booth and share the 4-letter code or the invite link. Link booths like https://zakrowling.github.io/photomates/mate need no code: the first person to open the link hosts, everyone else joins, and hosting is handed on if the host leaves.
- **Private**: there's no server. Cameras go directly between the browsers in your booth, and photos only exist on your own devices.

## How it works

- Each browser processes only its own camera: it shrinks each frame to 640×360, finds you, and sends a 512×256 video with you on the left and your mask (white = you, black = background) on the right. Sending the mask as part of the video keeps the edges clean through normal video calls, and nobody has to process anyone else's camera.
- Everyone has a video call with everyone else (WebRTC via [PeerJS](https://peerjs.com/), [`public/client.js`](public/client.js)). Each browser puts the colour and mask back together into a cut-out and draws the scene ([`public/scenes.js`](public/scenes.js)).
- The host's browser keeps track of who's in the booth, the seats, the scene and the shutter ([`public/engine.js`](public/engine.js)), and passes each person's photo on to everyone else in small pieces (PeerJS sends at most about 16KB per message). Room connections and host handover are in [`public/net.js`](public/net.js).
- Works best in Chrome or Edge on a laptop or desktop. Some networks can't connect browsers directly (strict work networks, some VPNs); for those, add a free relay (TURN) server: sign up at [Metered Open Relay](https://www.metered.ca/tools/openrelay/) and paste your credentials URL into `turnCredentialsUrl` in [`public/config.js`](public/config.js).

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000 (or http://localhost:3000/mate for the link booth). Cameras need `localhost` or HTTPS. To try it on your own, open a second tab and join with the code (the background tab updates slowly). An internet connection is still needed for PeerJS and to load MediaPipe.

## Test

```bash
npm test
```

## Deploy

Every push to `main` runs the tests and publishes the `public/` folder to GitHub Pages ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).

## Scenes and art

The scenes are drawn in code for now. Each scene in [`public/scenes.js`](public/scenes.js) lists its rows of seats (where each person goes and how big they are) and draws the background and whatever sits in front of each row, so a scene can be swapped for a real photo later.
