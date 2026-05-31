/* HELIX — Tweaks island. Mounts only the panel; applies values to the DOM. */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "gold",
  "coinMotion": 1,
  "headline": "convictions"
}/*EDITMODE-END*/;

const HEADLINES = {
  convictions: "<span class='l1'>Don't build strategies.</span><span class='l2'>Express <em>convictions</em>.</span>",
  beliefs:     "<span class='l1'>Your <em>beliefs</em> become</span><span class='l2'>living strategies.</span>",
  warm:        "<span class='l1'>Warm intelligence for</span><span class='l2'>the <em>conviction</em> economy.</span>"
};

function applyTweaks(t) {
  const root = document.documentElement;
  root.setAttribute('data-accent', t.accent);
  window.dispatchEvent(new Event('helix:theme'));
  window.dispatchEvent(new CustomEvent('helix:motion', { detail: t.coinMotion }));
  const h1 = document.getElementById('hero-h1');
  if (h1 && HEADLINES[t.headline]) h1.innerHTML = HEADLINES[t.headline];
}

function TweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => { applyTweaks(t); }, [t]);
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Material" />
      <TweakRadio label="Accent" value={t.accent} options={['gold', 'aqua', 'violet']}
                  onChange={(v) => setTweak('accent', v)} />
      <TweakSection label="Motion" />
      <TweakSlider label="Artifact drift" value={t.coinMotion} min={0} max={1.4} step={0.1}
                   onChange={(v) => setTweak('coinMotion', v)} />
      <TweakSection label="Copy" />
      <TweakSelect label="Headline" value={t.headline}
                   options={[
                     { value: 'convictions', label: 'Express convictions' },
                     { value: 'beliefs', label: 'Beliefs become strategies' },
                     { value: 'warm', label: 'Warm intelligence' }
                   ]}
                   onChange={(v) => setTweak('headline', v)} />
    </TweaksPanel>
  );
}

// apply defaults immediately (before edit mode is even toggled)
applyTweaks(TWEAK_DEFAULTS);
ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<TweaksApp />);
