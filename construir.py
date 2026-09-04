# Genera valdecerro.html: la versión 2 en un solo archivo, abrible con doble clic.
# Concatena los módulos de src/ en orden de dependencias, quitando import/export.
import re, pathlib, sys

RAIZ = pathlib.Path(__file__).parent
ORDEN = ['config', 'utils', 'state', 'terrain', 'graph', 'assets', 'agentmesh', 'buildings', 'economy', 'hud',
         'weather', 'calendar', 'world', 'animals', 'agents', 'events', 'growth', 'tech', 'save', 'main']
CABECERA = """import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
"""

declarados = {}
partes = [CABECERA]
for nombre in ORDEN:
    codigo = (RAIZ / 'src' / f'{nombre}.js').read_text(encoding='utf-8')
    for m in re.finditer(r'^(?:export\s+)?(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)', codigo, re.M):
        ident = m.group(1)
        if ident in declarados:
            sys.exit(f'Identificador duplicado "{ident}" en {nombre}.js y {declarados[ident]}.js')
        declarados[ident] = nombre
    # Los imports de espacio de nombres locales (import * as B) se resuelven quitando el prefijo.
    for alias in re.findall(r"^import \* as (\w+) from '\./", codigo, flags=re.M):
        codigo = re.sub(r'\b' + alias + r'\.(?=[A-Za-z_$])', '', codigo)
    codigo = re.sub(r'^import[^\n]*\n', '', codigo, flags=re.M)
    codigo = re.sub(r'^export\s+(?=(?:const|let|class|function)\s)', '', codigo, flags=re.M)
    partes.append(f'// ==================== {nombre}.js\n{codigo}')

bundle = '\n'.join(partes)
html = (RAIZ / 'index.html').read_text(encoding='utf-8')
marca = '<script type="module" src="./src/main.js"></script>'
if marca not in html:
    sys.exit('No se encontró la etiqueta del módulo principal en index.html')
html = html.replace(marca, '<script type="module">\n' + bundle + '\n</script>')
# El aviso de file:// no aplica al archivo único.
html = re.sub(r'<script>\s*// Abierto con doble clic.*?</script>\s*', '', html, flags=re.S)
html = html.replace("<title>Valdecerro, pueblo medieval</title>", "<title>Valdecerro (un solo archivo)</title>")
(RAIZ / 'valdecerro.html').write_text(html, encoding='utf-8')
print(f'valdecerro.html generado: {len(html)} caracteres, {len(ORDEN)} módulos')
