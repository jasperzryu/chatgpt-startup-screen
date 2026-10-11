# Third-party notices

## Original animation

[dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen) v1.1.0,
commit `4a2cfe642867fac013fdef90095981544a819a2a`, by Shen Honghong (沈宏宏).
The original code and text are licensed under MIT. The build keeps the original
license and README in `build/app/licenses` and records preservation checks in
`build/app/SOURCE-PRESERVATION.json`.

The upstream README identifies its voices and effects as recordings from a
third-party video and explicitly excludes those materials from its MIT license.
This repository does not redistribute the MP3 files. `prepare.ps1` fetches the
pinned upstream archive for a local build, which preserves the eight recordings.
The upstream source does not identify the original video or provide a separate
audio license; fetching it does not grant additional reuse rights.

## OpenAI assets

OpenAI, ChatGPT, the OpenAI wordmark, Blossom and OpenAI Sans belong to OpenAI.
See the [OpenAI Design Guidelines](https://openai.com/brand/) and
`assets/BRAND-SOURCES.json` for the public source locations.
The wordmark and Blossom geometry remain unchanged. The settings gear is an
interface badge, with the Blossom path preserved inside the shortcut icon.
These marks and fonts are excluded from the project's MIT license. OpenAI Sans
font binaries are fetched from their publisher during local preparation and are
not committed to this repository.

This project is a personal customization for an installed OpenAI application.
It is not developed, endorsed or distributed by OpenAI. The access and
verification screens are fictional visual effects.

## IBM Plex Mono

[IBM Plex](https://github.com/IBM/plex), copyright 2017 IBM Corp., Reserved Font
Name "Plex", is licensed under SIL Open Font License 1.1.
The full notice is in `assets/vendor/LICENSE-IBM-Plex.txt` and is included in
the local build. The downloaded font is pinned by SHA-256 in
`assets/dependencies.lock.json`.

## React

React and React DOM 18.3.1, copyright Facebook, Inc. and its affiliates, are
licensed under MIT. The unmodified production UMD bundles are in `assets/vendor`;
the full notice is in `assets/vendor/LICENSE-react.txt`.

## Microsoft WebView2

Microsoft.Web.WebView2 SDK 1.0.4258.31 is fetched from NuGet. It is subject to the
Microsoft license included in the SDK archive. The build copies that notice to
`build/app/licenses/LICENSE-WebView2.txt` and includes only the required x64
loader and .NET assemblies. The installed Evergreen WebView2 Runtime is a
separate system prerequisite.

