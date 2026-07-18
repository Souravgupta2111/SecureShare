# SecureShare E2E tests (Maestro)

Starter [Maestro](https://maestro.mobile.dev/) flows covering the core loop:
**Auth → Upload/Share → View → Revoke**.

These are a scaffold. They rely on on-screen text today; for stable CI you should
add `testID` / `accessibilityLabel` props to the key controls referenced in the
flows (marked with `# TODO: add testID` below) and switch selectors to `id:`.

## Prerequisites

```bash
# Install Maestro (macOS/Linux)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Build & install a Dev Client (screen-capture + native crypto need this)
npx expo run:android   # or run:ios
```

Set two accounts you control for the sharing flow:

```bash
export SS_OWNER_EMAIL="owner@example.com"
export SS_OWNER_PASSWORD="..."
export SS_RECIPIENT_EMAIL="recipient@example.com"
```

## Run

```bash
maestro test .maestro/01_auth.yaml
maestro test .maestro/02_share_and_revoke.yaml
# or the whole suite
maestro test .maestro/
```

## Notes

- The app defers RSA key generation to first share; the flow allows extra time
  on the KeyGeneration screen.
- Screenshots are blocked on Android (FLAG_SECURE), so Maestro screenshots in the
  viewer will be blank — that's expected and is itself a signal the protection works.
