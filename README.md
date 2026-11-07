# Photomates

A group photobooth for remote mates, in the style of Teams' Together Mode. Everyone joins a booth from their own computer, their camera background is removed, and the whole group sits together in one scene. Press the shutter, everyone gets a 3-2-1 countdown, and out comes a group photo to download. Try it at **https://zakrowling.github.io/photomates/** or jump straight into the shared booth at **https://zakrowling.github.io/photomates/mate**.

- **Background removal in your own browser**: [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)'s selfie segmenter finds you in every camera frame. Only pixels it's fairly sure are you are kept, and the edge is feathered so hair fades out softly rather than leaving a halo. A face detector keeps everyone framed the same way (head near the top, shoulders at the bottom, faces the same size), so the group looks right together.
- **Scenes**:
  - **We The Jury**: two tiers of 3 chairs behind wooden desks ([`public/assets/bg/office.jpg`](public/assets/bg/office.jpg)). Up to 6 mates sit in the chairs, and the desks hide everyone's lower half.
  - **Extra Leg Room**: a golden-lit plane cabin ([`public/assets/bg/airplane.jpg`](public/assets/bg/airplane.jpg)). Up to 6 mates sit in the front-row seats either side of the aisle, faces in front of the headrests, with the seat-back tables in front hiding them from the chest down.
  - **Tiki Pool Bar**: 6 pool rings in front of a thatched pool bar ([`public/assets/bg/tiki-pool-bar.jpg`](public/assets/bg/tiki-pool-bar.jpg)). Everyone pops up out of a ring: they're sized to fit its hole, and the front of the ring and the water hide them from the chest down. Up to 6 mates at a time.
  - **Life's A Beach**: two tiers of 3 colourful deckchairs on a sunny beach ([`public/assets/bg/beach.jpg`](public/assets/bg/beach.jpg)). Up to 6 mates sit in the chairs, and the sand ledges hide everyone's lower half.
  - **The Matey Bunch**: a Brady Bunch style title card ([`public/assets/bg/the-matey-bunch.jpg`](public/assets/bg/the-matey-bunch.jpg)) with up to 8 mates in the squares around the logo, filled in a balanced order. Cut-outs here have crisp edges (no feathering) and run flush to the bottom of their square.
  - **Together Strong**: 6 headless bodybuilders, three standing and three kneeling in front ([`public/assets/bg/bodybuilders.jpg`](public/assets/bg/bodybuilders.jpg)). Everyone's head goes on a body: it's sized from the neck, the chin sits just over the neck, and everything below the chin fades out so the body is the photo's. The middle standing body fills first, then the middle kneeling one, then outwards. Up to 6 mates at a time.
  - **Mammal Mates**: 6 headless animals in a sunny meadow: a cheetah, a meerkat and an emu at the back, a deer, a lion and a bear lying in front ([`public/assets/bg/mammal-mates.jpg`](public/assets/bg/mammal-mates.jpg)). Up to 6 mates at a time.
  - **Anime-zing Crew**: 6 headless samurai, three standing and three kneeling in front ([`public/assets/bg/samurai.jpg`](public/assets/bg/samurai.jpg)), with heads placed the same way. Faces are drawn to match the illustration: flat, cel-shaded colours and dark ink outlines. Up to 6 mates.
  - **Xmas '88**: a retro Polaroid of 6 headless mates in Christmas jumpers by the tree, three standing and three sitting in front ([`public/assets/bg/christmas.jpg`](public/assets/bg/christmas.jpg)). Faces get a faded, warm 80s film look to match. Up to 6 mates.
  - **Spooktober**: an old black-and-white photo of 6 headless monsters: a vampire, a mummy and Frankenstein's monster at the back, a ghost bride, a werewolf and a skeleton in front ([`public/assets/bg/halloween.jpg`](public/assets/bg/halloween.jpg)). Faces turn black and white to match. Up to 6 mates.
  In the office, the desk in front of you hides your lower half, so everyone looks like they're really sitting there. To make it look like one photo, each person is colour matched to the scene, shaded where the desk's shadow falls across them, given a soft shadow behind, softened slightly in the back rows, and the whole picture gets a fine film grain. If you sit close to your camera (so your body ends early), you're grown a little and lowered just enough for the desk to hide where it ends. Every spot in a scene is always filled: if there are fewer mates than spots, the people there are repeated to fill the rest (on your own, every seat is you). The booth (and the finished photo) is cropped to each scene's own shape: 16:9 for the office and airplane, 3:2 for the bodybuilders, samurai and Christmas photos, 4:3 for The Matey Bunch. Pick a scene from the dropdown in the toolbar, which stays fixed to the bottom of the window. If more mates are in the booth than a scene has spots, 6 at a time are in the picture: each shuffle picks who's in, favouring whoever has sat out most, so everyone takes turns. Anyone can switch scenes or shuffle the seats (even on your own, which moves you to a random spot in the scene), and everyone sees the change.
- **The photo**: anyone can press **Take photo**. Everyone sees the same countdown and flash. At the shutter, each browser takes a full-quality picture of its own person and sends it to everyone else, and every browser puts together the same high-resolution group photo (2560×1440 PNG), so everyone can download it. Every photo from the session is kept: a **Your photos** button beside Take photo opens them all, to view any of them or download them all at once. Each photo has the Workmates logo in the corner. When Photomates is embedded in another site (in an iframe), where downloads are often blocked, the button opens the photo in a new tab instead, to save from there.
- **Up to 12 mates** per booth. Someone without a camera (or who has wandered off) shows as a silhouette in their colour.
- **Rooms**: create a booth and share the 4-letter code or the invite link. Link booths like https://zakrowling.github.io/photomates/mate need no code: the first person to open the link hosts, everyone else joins, and hosting is handed on if the host leaves. Everyone first gathers in a lobby with 6 slots (Mate 1 to Mate 6, plus a "+N more" note for bigger groups), each showing that mate's live camera with the background removed. Anyone presses **Open the booth** to take everyone in together, and the home button in the toolbar takes everyone back to the lobby. Mates who join while the booth is open go straight in.
- **Embedding for many groups**: an app that embeds the game can give each group its own private room by passing its own session id: `https://zakrowling.github.io/photomates/?group=<session id>`. Everyone with the same id lands in the same room, different ids never meet, and ids can be any length or characters (they're hashed into a room name). Plain `/mate` stays one shared room.
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
