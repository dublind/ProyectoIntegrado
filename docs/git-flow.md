# Flujo de ramas (Git Flow)

El repositorio sigue Git Flow. Nadie trabaja directo en `main` ni en `develop`: todo cambio entra por una rama de trabajo y se integra con `merge --no-ff` (o un pull request), para que el historial muestre qué entró y cuándo.

## Ramas permanentes

| Rama | Para qué sirve |
| --- | --- |
| `main` | Versión estable y entregable. Solo recibe merges de `release/*` y `hotfix/*`, y cada merge lleva una etiqueta `vX.Y.Z`. |
| `develop` | Integración del sprint en curso. Recibe las ramas `feature/*` y `bugfix/*` terminadas. |

## Ramas de trabajo

| Prefijo | Nace de | Se integra en | Ejemplo |
| --- | --- | --- | --- |
| `feature/` | `develop` | `develop` | `feature/58-estados-pedido` |
| `bugfix/` | `develop` | `develop` | `bugfix/inventario-doble-conteo` |
| `release/` | `develop` | `main` y `develop` | `release/1.0.0` |
| `hotfix/` | `main` | `main` y `develop` | `hotfix/1.0.1-login` |

Conviene poner el ID del PBI de Azure Boards en el nombre de la rama y en el mensaje del commit (`feat(pedidos): estados del pedido #58`).

## Comandos

Nueva funcionalidad:

```bash
git switch develop
git pull
git switch -c feature/58-estados-pedido
# ... commits ...
git push -u origin feature/58-estados-pedido
```

Al terminar, abrir un pull request de la rama hacia `develop`. Si se integra en local:

```bash
git switch develop
git pull
git merge --no-ff feature/58-estados-pedido
git push
git branch -d feature/58-estados-pedido
git push origin --delete feature/58-estados-pedido
```

Entrega al final del sprint:

```bash
git switch -c release/1.0.0 develop
# solo correcciones menores y versión
git switch main && git merge --no-ff release/1.0.0 && git tag -a v1.0.0 -m "Sprint N"
git switch develop && git merge --no-ff release/1.0.0
git push origin main develop --tags
```

Un `hotfix/` sigue el mismo cierre que `release/`, pero nace de `main`.

## Integración continua

GitHub Actions (`.github/workflows/ci-cd-agua.yml`) corre en cada push a `main`, `develop`, `testing`, `release/**` y `hotfix/**`, y en los pull request hacia `main`, `develop` y `testing`. El job **Pruebas del Backend y Compilación** ejecuta `npm run check` y falla si falla una prueba o la compilación. Antes de abrir un pull request, correr lo mismo en local:

```bash
npm run check
```

Quien tenga instalada la extensión `git-flow` puede usar `git flow init -d`: los prefijos de arriba son los valores por defecto, con `main` como rama de producción.
