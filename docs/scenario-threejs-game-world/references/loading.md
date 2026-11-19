# Loading without a frozen page

Measured on the build of 14 November 2026 (five levels, one laptop). Before the work, every level start froze the page for 6 to 10 s in one main-thread task. Four rounds of tests had passed with it: the scripted round waits for "ready", the frame rate probe drops its first frames, stills come after warm-up. The first person to play met it in the first minute.

The tools of that build are not packaged with this skill. What follows is the method and its figures.

## The test that was missing

Measure the load itself, from navigation to ready and through the first 20 s of play:

- the longest main-thread task (`PerformanceObserver` on `longtask`, tasks over 50 ms) and the longest gap between two frames;
- time to ready;
- the number of steps of the loading bar and its longest stall;
- shader programs created after ready (target 0).

Run it in four conditions. Each one shows a different cost:

| Condition              | How                                                                           | What it shows                              |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Normal                 | warm browser, second visit                                                    | the floor                                  |
| Slow CPU               | `Emulation.setCPUThrottlingRate` at 4 through the DevTools protocol           | main-thread work that a fast machine hides |
| Fresh profile          | a new browser profile                                                         | what the browser cache was saving          |
| Shader text never seen | a URL switch (`?cold=<n>`) adds a constant far below one display step to GLSL | the true first visit                       |

A fresh profile is not a cold start: on the build's machine the graphics driver kept compiled pipelines outside the browser profile. Only changed shader text brings back the first-visit cost.

Thresholds used: target 100 ms, limit 500 ms for the longest task in normal conditions. A before and after table compares the same condition on both sides.

## Profile by stage first

A stage timer behind a URL switch (`?prof=1`) gave, for one level start: 3.3 s polygonising one hand of the view model on the main thread, 2.2 s linking shader programs one by one at first use, 1.8 s uploading textures, 0.6 s of shadow maps. Fetch and parse were small, so the network was never the subject.

## Method

1. **Work without GL goes to workers at the first moment of boot**: geometry built from an implicit surface, image decode with `createImageBitmap`.
2. **Main-thread work runs in slices of about 9 ms**, yielding with a `MessageChannel` message. A timer is clamped to 4 ms and starves under load.
3. **Textures upload a few per slice** with `renderer.initTexture`. Upload cost about 4.6 ms per megapixel on the main thread.
4. **Create every shader program before anything draws**, let the driver link in the background, and follow `KHR_parallel_shader_compile` to move the bar.
5. **Draw the first frames in pieces behind the loading screen**, with a GPU fence between pieces.
6. **Tell the player on a first visit.** After 6 s the loading screen says that a first visit compiles shaders and that the next load is faster.

Order: textures, then programs, then nothing that asks the GPU a question until the programs are linked.

## Traps

- **`renderer.compile` only helps when the program key matches draw time.** Three mismatches in the build: a clipping plane in the mirror view, the light count, a geometry without normals in the post stack. Dump the keys at compile time and at first draw and compare them (a debug switch such as `?dbgkeys=1`).
- **A GL call that needs an answer waits for every pending link.** One stray read turns background linking into a block.
- **Linked is not ready to draw.** The pipeline can still compile at first draw: hence the first frames in pieces.
- **A program created late waits behind queued draws.**
- **Hiding with `visible` changes the light count, and with it the program key.** `layers.mask` hides without changing it.
- **A polygoniser shortcut needs slack**: 0.009 for a field stepping up to 6.6 mm.
- **Timing is only as clean as the machine.** The same level read 7.1 and 17.0 s to ready in two rounds while other work ran. Give ranges, and compare two builds with frames taken in turn in one browser.

## What the build measured

Longest main-thread block during load, normal conditions (two rounds after the work):

| Level | Before   | After          |
| ----- | -------- | -------------- |
| 1     | 6,595 ms | 111 and 245 ms |
| 2     | 6,555 ms | 76 and 129 ms  |
| 3     | 5,914 ms | 75 and 155 ms  |
| 4     | 6,673 ms | 127 and 335 ms |
| 5     | 6,263 ms | 261 and 383 ms |

By condition, all five levels:

| Condition          | Longest block before | Longest block after | Ready before   | Ready after   |
| ------------------ | -------------------- | ------------------- | -------------- | ------------- |
| Normal             | 5.9 to 6.7 s         | 75 to 383 ms        | 7.0 to 7.6 s   | 5.7 to 17.0 s |
| CPU slowed 4 times | 20.1 to 29.1 s       | 212 to 812 ms       | 22.6 to 32.2 s | 8.3 to 20.6 s |
| Fresh profile      | 6.0 to 10.3 s        | 147 to 547 ms       |                |               |

- The wide "ready after" range in normal conditions comes from other work on the machine; on a quiet machine the same build was ready in 5.1 to 5.7 s.
- With the CPU slowed four times, 3 of 10 runs exceeded the 500 ms limit (553, 598 and 812 ms), with other work running on top of the throttle.
- Shader text never seen: 16 to 43 s to ready, longest block 78 to 312 ms, bar stalls of 2.4 to 8.8 s. On the final build, one round run alone: ready after 9.9 to 17.8 s, longest block 64 to 191 ms, bar stall 1.2 to 3.2 s.
- Loading bar in normal conditions: 82 to 90 steps, longest stall 308 to 725 ms.
- Shader programs created in the first 20 s of play: 0 on all five levels.
