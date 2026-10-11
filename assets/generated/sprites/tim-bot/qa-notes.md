# Tim Bot animation QA — 2026-10-11

Approved identity: `base-source.png`, user approved style A in chat. Generated through sprite-gen/Codex with CLI model gpt-5.5; no metered OpenAI API route used. No additional motion references.

Five states, four 256×256 RGBA frames each. `greet`/`reading`: 5fps; other states: 4fps. `greet`, `choose`, `input` are one-shot gestures in the app; `waiting` and `reading` loop. Atlas: 1024×1280. Runtime CSS positions and timing match `manifest.json`; checked at 112px and result mascot at 72px in browser screenshots.

| State | Verdict | Evidence |
| --- | --- | --- |
| greet | pass for short stylized gesture | All four contact frames reviewed; clear neutral → raised hand → wave → neutral. Both arms/legs and headset intact. Slight head tilt is part of the gesture. |
| choose | pass for short stylized gesture | First take rejected for shrinking body during extended-arm poses. Regenerated with compact gesture. New contact frames preserve body scale and read as neutral → gesture → indicate option → neutral. |
| input | pass for short stylized gesture | Envelope remains attached to hands/body. Clear invitation gesture, no missing limbs or clipped props. |
| waiting | pass for short stylized loop | Lens moves inward/outward with a blink. Start/end body position and prop placement are close; sampled last-to-first rendering remains readable. |
| reading | pass for subtle mouth loop | Card stays stationary; mouth visibly changes closed/small/wide/small. Inspector warns motion presence 0.0065 < 0.01 because only the mouth moves. Accepted after inspecting all frames and rendered cycle, not by lowering the threshold. Not phoneme lip sync. |

Automated extraction and atlas composition passed without errors. Inspector passed with the documented reading warning. Reviewed every contact sheet and browser-rendered cycle snapshots 0/1/2/3/0 in `.manual-test/tim-bot/`. No detached particles, empty frames, visible green matte, or cropped body parts observed. Animated GIFs are available in `previews/`; exporter GIF previews repeat even for one-shot app gestures.

Browser test: `npm run test:bot`, API/audio events mocked. Verifies option/input focus, waiting state, actual `onplaying`/`onended` event wiring, sprite coordinates against runtime manifest, reduced motion, and 375/1100px horizontal fit. Node tests additionally cover play rejection, audio errors, cancellation, stale speech responses and settings transitions.

Limitations: short pose animation, not interpolated high-frame-rate motion; minor expression variation remains. No real-device or live TTS listening test. Preview sampling verifies rendered phases, not an independent human smoothness verdict.
