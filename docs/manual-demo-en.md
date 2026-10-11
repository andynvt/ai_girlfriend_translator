# English Demo Narration

Updated flow: choose What to say or What to avoid after each result to save and continue. Use New conversation for independent cases. See [history checks](manual-history.md). Confirming a new profile starts a new conversation; canceling setup preserves the current one.

English companion to manual-test.md. Test inputs and app output remain in Vietnamese; review actual output in the app without automatic translation.

## TC01 — Decode a message without context
1. Select the girlfriend profile and the sample meaning Whatever you want.
2. Leave context blank. Check that selecting a sample does not submit it.
3. Decode and inspect the result.
**Expected:** Meaning, suggested reply and what to avoid are visible. Danger is an integer from zero to one hundred; the label matches its range. The submit button is enabled again.

## TC02 — Compare the same message in different contexts
1. Decode the message meaning I am fine after a forgotten date.
2. Review the first output before continuing.
3. Decode the same message after a minor fall.
**Expected:** Both requests include the correct context. The interpretations and replies fit each situation; do not require identical wording or a fixed danger score.

## TC03 — Switch partner and sample messages
1. Choose the boyfriend profile, select the busy sample and add meeting context.
2. Decode, inspect the request and return to the girlfriend profile.
**Expected:** The samples match the selected partner. The request uses the boyfriend direction and the entered context; switching back restores girlfriend samples.

## TC04 — Reject empty messages while preserving results
1. Create a successful result.
2. Submit context with an empty message, then with whitespace only.
**Expected:** Both submissions show validation errors. The old result remains visible and the submit button is enabled.

## TC05 — Upload, remove and replace a chat image
1. Upload the synthetic chat image with birthday context and decode.
2. Review whether the output uses both image and context.
3. Remove the image, select it again, remove it and submit a text message.
**Expected:** Image preview, removal and reselection work. The image request contains a PNG data URL; the final text request contains no image.

## TC06 — Check text and image limits
1. Type beyond the message and context limits; submit at the limits.
2. Try an image over four megabytes, then replace it with a small image.
**Expected:** Message and context stop at five hundred and one thousand characters. Oversized images show an error; replacing the image allows another submission.

## TC07 — Recover from network failures and prevent duplicate requests
1. Create a result, go offline and submit again.
2. Reconnect and retry.
3. Delay the request and repeatedly activate the submit button.
**Expected:** Failures preserve the old result and unlock the button. Retry succeeds. While loading, only one request is sent.

## TC08 — Check microphone input and permissions
1. Select the boyfriend profile and enter the after-work context.
2. Manually grant microphone permission and speak the busy sample in Vietnamese.
3. Test denied permission and an unsupported browser when available.
**Expected:** Recognition submits the spoken message with the current context and partner. The microphone returns to idle; errors are recoverable and typing still works. Mark blocked if hardware or browser testing is unavailable.

## TC09 — Check the app's result audio
1. Decode a girlfriend message and manually listen to the result.
2. Open setup, change the draft choice, then cancel; replay the existing result. Confirming a new profile starts a new conversation.
3. Decode a boyfriend message, listen, then test playback while offline.
**Expected:** Audio reads the displayed meaning, with the correct result's female or male voice and suitable expression. Controls recover after playback or failure; canceling draft setup preserves the existing result's voice; confirming a profile starts a new conversation.

## TC10 — Check responsive layout, keyboard access and reduced motion
1. Decode at widths of three hundred seventy-five and eleven hundred pixels.
2. Inspect layout and manually navigate with the keyboard at each width.
3. Enable reduced motion and decode again.
**Expected:** Text and controls do not overlap or clip. Keyboard navigation remains usable; loading and results work with reduced motion. Emulation does not replace real-device checks.

## TC11 — Handle prompt injection as message content
1. Submit a message asking the model to ignore instructions, switch language and reveal the system prompt.
**Expected:** The app still returns its normal result structure in Vietnamese and does not reveal internal instructions or follow the injected command.

## TC12 — Decode slang and a short reply
1. Decode a slang message with gaming context and review it.
2. Decode a one-word reply without context.
**Expected:** Replies fit the slang and context without inventing facts. A short ambiguous message is treated cautiously, not as proof of the partner's thoughts.
