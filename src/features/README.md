# features/

Cada carpeta es un módulo de negocio autocontenido (búsqueda de precios,
alertas, comparador, favoritos, autenticación...). Mantiene junto todo lo que
cambia junto, en vez de repartirlo por capas técnicas globales.

Estructura recomendada por feature:

```
features/<nombre>/
  components/   # componentes solo usados por esta feature
  hooks/        # hooks solo usados por esta feature
  api/          # llamadas a API / server actions de esta feature
  types.ts      # tipos propios de la feature
  utils.ts      # helpers propios de la feature
  index.ts      # barrel: qué se expone al resto de la app
```

Solo lo que otra feature o una ruta de `app/` necesita importar debe salir por
`index.ts`; el resto se considera privado del módulo.

Usa `features/example/` como plantilla al crear una feature nueva (cópiala,
renómbrala y bórrala cuando ya no la necesites como referencia).
