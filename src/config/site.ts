export const siteConfig = {
  name: "Find Your Prices",
  description:
    "Compara precios y encuentra las mejores ofertas en un solo lugar.",
  url: "https://findyourprices.com",

  /**
   * Dirección de contacto pública.
   *
   * La usan la página de privacidad y —lo importante— el procedimiento de
   * retiro de contenido: una tienda que quiera salir del comparador tiene que
   * poder escribir a algún lado. Un procedimiento de retiro sin buzón que lo
   * reciba no vale nada, así que esto tiene que apuntar a un correo que
   * alguien realmente lea.
   */
  contactEmail: "hola@findyourprices.com",

  /**
   * Identificador con el que el scraper se presenta ante las tiendas. Se
   * publica en la política de contenido para que cualquier sitio que prefiera
   * no aparecer pueda bloquearlo por su cuenta, sin esperar respuesta de nadie.
   * Debe coincidir con `DEFAULT_USER_AGENT` de server/scraping/http.ts.
   */
  botUserAgent: "FindYourPricesBot",

  /**
   * Quiénes hicieron esto. Se mencionan dentro del texto de "Acerca de", con
   * enlace a su perfil: el apodo de GitHub ya es la identidad pública de cada
   * uno y su perfil dice más que cualquier biografía inventada.
   */
  creators: [
    { nick: "crywhat7", url: "https://github.com/crywhat7" },
    { nick: "fq962", url: "https://github.com/fq962" },
  ] as const,

  links: {
    // Rellena aquí los enlaces sociales / repos cuando existan.
  },
} as const;
