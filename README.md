# Photomates

A group photobooth for remote mates, in the style of Teams' Together Mode. Everyone joins a booth from their own computer, their camera background is removed, and the whole group sits together in one scene. Press the shutter, everyone gets a 3-2-1 countdown, and out comes a group photo to download. Try it at **https://zakrowling.github.io/photomates/** or jump straight into the shared booth at **https://zakrowling.github.io/photomates/mate**.

- **Background removal in your own browser**: [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)'s selfie segmenter finds you in every camera frame. Only pixels it's fairly sure are you are kept, and the edge is feathered so hair fades out softly rather than leaving a halo. A face detector keeps everyone framed the same way (head near the top, shoulders at the bottom, faces the same size), so the group looks right together.
- **Scenes**:
  - **Office**: a photo of a tiered wooden auditorium ([`public/assets/bg/office.jpg`](public/assets/bg/office.jpg)). Everyone sits in one of its chairs, behind its desks.
  - **Outdoor Theatre**: sunny concrete steps among trees ([`public/assets/bg/outdoor-theatre.jpg`](public/assets/bg/outdoor-theatre.jpg)). Everyone sits on a step, and its front edge hides them from the seat down.
  - **Stadium**: rows of blue stadium seats.
  - **Brady Bunch**: everyone in their own square on a grid that grows with the group.
  In the photo scenes and the stadium, the desk, step or row of seats in front of you hides your lower half, so everyone looks like they're really sitting there. To make it look like one photo, each person is colour matched to the scene, shaded where the desk's shadow falls across them, given a soft shadow behind, softened slightly in the back rows, and the whole picture gets a fine film grain. If you sit close to your camera (so your body ends early), you're grown a little and lowered just enough for the desk to hide where it ends. Anyone can switch scenes or shuffle the seats, and everyone sees the change.
- **The photo**: anyone can press **Take photo**. Everyone sees the same countdown and flash. At the shutter, each browser takes a full-quality picture of its own person and sends it to everyone else, and every browser puts together the same high-resolution group photo (2560×1440 PNG), so everyone can download it. Every photo from the booth stays in a strip under the controls, so anyone can go back and download any of them.
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

Each scene in [`public/scenes.js`](public/scenes.js) lists its rows of seats: where each desk edge is, where a seated face goes, how big people are in that row, and where the chairs are. A photo scene (`photoScene`) draws the photo, then after each row of people redraws the photo from that row's desk or step edge down, so the photo itself hides everyone's lower half. To add one, use a straight-on photo of rows of seats or steps with horizontal edges, and measure those positions on the 1280×720 stage. The stadium and Brady Bunch scenes are drawn in code.
