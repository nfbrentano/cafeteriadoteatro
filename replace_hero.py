import re

with open('index.html', 'r') as f:
    html = f.read()

with open('scratch-hero.html', 'r') as f:
    new_hero = f.read()

pattern = re.compile(r'    <!-- ═══════════════════════════════════════\n         HERO\n    ══════════════════════════════════════════ -->\n    <section class="hero" id="home".*?</section>', re.DOTALL)

html = pattern.sub(new_hero, html)

with open('index.html', 'w') as f:
    f.write(html)
