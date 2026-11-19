# Audio

Evidence: measured in the reference build for generation, file checks and the mix switches. Whether the result sounds right was judged by one person, in play; say in every hand-over whether a person listened.

Load `scenario-audio` for the generation calls. Model names used in the build are in [models-2026-11-15.md](models-2026-11-15.md).

## Contents

- The event list, from the player's side
- One-shots
- Loops and ambience
- Footsteps and surfaces
- Music
- Voices
- Processing and file checks
- Mix
- What the human play said
- Checks

## The event list, from the player's side

Write the list before generating, by walking through a session as the player:

| Moment    | Events                                                              |
| --------- | ------------------------------------------------------------------- |
| Moving    | Steps per surface for walk, run, crouch; jump, land; gear rustle    |
| Acting    | Each weapon or tool: use, empty, reload stages, switch              |
| Vehicle   | Engine at load and off load, tyre, gear, impact, wind               |
| Being hit | Hit, final hit, low health                                          |
| Dying     | Last breath, fall, ring, a lost-signal sting, the mix closing down  |
| Opponents | Wake or alert call, move, warn, act, one destruction sound per kind |
| World     | Doors, lifts, machines, weather, room tone per space                |
| Interface | Move, confirm, back, objective, checkpoint, results                 |
| Story     | Voice lines, music cues                                             |

A list written from the code's events missed the player's own death in the build: there was no sound for it until a person played.

## One-shots

- Every prompt names **source, material, action and space**, and excludes voice and music. Example shape: "single heavy boot step on wet concrete, close, in a large empty hall, no voice, no music".
- Ask for **several separated events per clip** (four to six steps or hits with silence between). One job then gives a set of variations to slice.
- Choose the sound model in a shoot-out on one prompt, on measures. The build compared takes of steps on wet concrete and kept the model whose take had four even steps and a 1.8 ms attack.
- Play variations in random order with a small pitch and gain spread, never the same file twice in a row.

## Loops and ambience

- Room tone per space, 20 s or longer, checked for a click at the loop point.
- Rain, wind, machines as separate loops so the mix can move them.
- Ask for "steady, no events, no voice, no music" and check the speech band share of the file.

## Footsteps and surfaces

- Six surfaces in the build: wet concrete, water, metal grating, tile, gravel, wood. For each: walk, run, crouch, land, jump.
- The surface under the player comes from the level data. Test it over the whole walkable grid, not at one point: the first step test passed at its point while a road answered "metal" on 42 percent of its surface, and a threshold lower than the picture's made 82 percent of one ground count as water ([play-tests.md](play-tests.md)).
- Step timing follows the distance walked, not a timer.

## Music

- One instrumental cue per level or mood. The build had one cue of 48 s in its first version and four more for the other levels.
- Ask for an instrumental with a stated tempo and mood, with a clean start and end for looping.
- Music sits under effects and voice. Check the cue in the mix, in a fight.

## Voices

- One voice per character, held with fixed settings (stability 0.8 for the operator of the build).
- Choose the voice on the processing it will go through. Three preset voices were compared on one line; the one with the highest spectral centroid (1,459 Hz) was kept because it survives a radio band-pass.
- 56 lines in the build, written short: one fact or one order per line.
- **Transcribe every line and compare with the script** (`scripts/audio_check.py` with `--with mlx-whisper`).
- Before paying for a retake, check the line with a second speech model and treat same-sounding words as a pass. Rare words are misheard by a small speech model. Four lines were regenerated in the build and none of the retakes was kept.
- Subtitles come from the same script file as the audio.

## Processing and file checks

- Trim silence, level to -3 dB peak for effects, mono at 44.1 kHz for positional sounds, stereo for music and ambience.
- One command does the trim, the level and the table:

```
uv run --with numpy python scripts/audio_check.py public/audio out/audio.tsv shot=raw/shot.mp3:0.6:-1.5:t rain=raw/rain.mp3:20:-6:k
```

- The table holds duration, peak, RMS, spectral centroid and speech band share per file. A high speech band share in an effect means a stray voice: listen or regenerate.
- An audio request check reads which clips the game asks for during a scripted round. It proves the wiring, and it does not listen.

## Mix

- Three buses with a volume each in the options: effects, music, voice.
- A radio voice goes through a band-pass. Lowering music under a voice line is usual practice and was not measured in the build.
- On death the mix is low-passed (520 Hz in the build) until respawn.
- Menu gains are set at once on entering a menu and restored at deploy.
- The audio context resumes on the first gesture. Test browsers run with `--mute-audio`.
- When the page is hidden or the canvas is off screen, suspend the context ([performance.md](performance.md)).

## What the human play said

The sound was measured during the build, not heard. The first play sessions by a person gave:

- step sounds "not too believable";
- no sound when the player dies;
- voices wanted.

Each led to work listed above: surfaces over the whole grid, the death sequence, an operator voice. The lesson for the order of work: a person listens to the first playable level, before the full set is generated.

## Checks

- Every line of the event list has a file, and the game requests it in a scripted round.
- The table of `audio_check.py` has no file outside its duration and peak bounds and no effect with a high speech band share.
- Every voice line matches its script.
- Step surfaces by share of the walkable grid match the picture.
- A person has listened to a full level with headphones. Write "heard by a person: yes" or "no" in the hand-over.
