export default function Guide() {
  return (
    <section className="menu-card">
      <h2>User Guide</h2>
      <ol className="guide-list">
        <li>This app is used to watch multiple screens at once.</li>
        <li>Click a stream to place it on the multiscreen.</li>
        <li>Click a tile to focus that game and select its audio. In Grid wall, tiles stay in place.</li>
        <li>Choose a layout or show the Stream 1 / Stream 2 selector in Options, beside Phone remote.</li>
        <li>Click a screen title in the multiscreen to remove it.</li>
        <li>This app has popups, often NSFW. I am trying to fix it.</li>
        <li>
          Install the{" "}
          <a
            href="https://chromewebstore.google.com/detail/multisport420/pliaafmjkfpficapmcoadpkbfijhjbfg?authuser=1&hl=en"
            target="_blank"
            rel="noopener noreferrer"
          >
            Multisport420 Chrome extension
          </a>{" "}
          to remove popups and switch audio to the video you spotlight. Spotlighting
          the fantasy scoreboard preserves the current video’s audio.
        </li>
        <li>
          You can only use this tool if you legally have access to the content.
        </li>
      </ol>
    </section>
  );
}
