"""Convierte dist-demo/index.html en una página para publicar como Artifact
(sin <html>/<head>/<body>: el visor agrega su propio esqueleto)."""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
h = open(src, encoding='utf-8').read()
fonts = re.findall(r'<link[^>]+fonts\.googleapis\.com/css2[^>]+>', h)
styles = re.findall(r'<style[^>]*>.*?</style>', h, re.S)
scripts = re.findall(r'<script type="module"[^>]*>.*?</script>', h, re.S)
page = '\n'.join([
    '<title>IIC Comprobantes</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    *fonts,
    '<style>html,body{background:#F6F8F8;color:#17262C;color-scheme:light}</style>',
    *styles, '<div id="root"></div>', *scripts,
])
open(dst, 'w', encoding='utf-8').write(page)
print(f'{dst}: {len(page)/1e6:.2f} MB')
