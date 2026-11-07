# Photomates

A group photobooth for remote mates, in the style of Teams' Together Mode. Everyone joins a booth from their own computer, their camera background is removed, and the whole group sits together in one scene. Press the shutter, everyone gets a 3-2-1 countdown, and out comes a group photo to download. Try it at **https://zakrowling.github.io/photomates/** or jump straight into the shared booth at **https://zakrowling.github.io/photomates/mate**.

- **Background removal in your own browser**: [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)'s selfie segmenter finds you in every camera frame. Only pixels it's fairly sure are you are kept, and the edge is feathered so hair fades out softly rather than leaving a halo. A face detector keeps everyone framed the same way (head near the top, shoulders at the bottom, faces the same size), so the group looks right together.
- **Scenes**:
  - **Office**: a photo of a tiered wooden auditorium ([`public/assets/bg/office.jpg`](public/assets/bg/office.jpg)). Everyone sits in one of its chairs, behind its desks.
  - **The Matey Bunch**: a Brady Bunch style title card ([`public/assets/bg/the-matey-bunch.jpg`](public/assets/bg/the-matey-bunch.jpg)) with up to 8 mates in the squares around the logo, filled in a balanced order. Cut-outs here have crisp edges (no feathering) and run flush to the bottom of their square.
  - **Bodybuilders**: 6 headless bodybuilders, three standing and three kneeling in front ([`public/assets/bg/bodybuilders.jpg`](public/assets/bg/bodybuilders.jpg)). Everyone's head goes on a body: it's sized from the neck, the chin sits just over the neck, and everything below the chin fades out so the body is the photo's. The middle standing body fills first, then the middle kneeling one, then outwards. Up to 6 mates (the button greys out with more in the booth).
  - **Samurai**: 6 headless samurai, three standing and three kneeling in front ([`public/assets/bg/samurai.jpg`](public/assets/bg/samurai.jpg)), with heads placed the same way. Up to 6 mates.
  In the office, the desk in front of you hides your lower half, so everyone looks like they're really sitting there. To make it look like one photo, each person is colour matched to the scene, shaded where the desk's shadow falls across them, given a soft shadow behind, softened slightly in the back rows, and the whole picture gets a fine film grain. If you sit close to your camera (so your body ends early), you're grown a little and lowered just enough for the desk to hide where it ends. Anyone can switch scenes or shuffle the seats, and everyone sees the change.
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

Each scene in [`public/scenes.js`](public/scenes.js) lists its rows of seats: where each desk edge is, where a seated face goes, how big people are in that row, and where the chairs are. A photo scene (`photoScene`) draws the photo, then after each row of people redraws the photo from that row's desk or step edge down, so the photo itself hides everyone's lower half. To add one, use a straight-on photo of rows of seats or steps with horizontal edges, and measure those positions on the 1280×720 stage. A heads-on-bodies scene (`bodyScene`) is a photo of headless bodies; list the middle and width of each neck's top edge on the stage. A face-in-hole board (`holeScene`) is any photo with bright green (#00ff00) ovals where faces go; list each oval's centre on the stage and its size.
