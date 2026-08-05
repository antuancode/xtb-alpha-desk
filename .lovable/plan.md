# Acceso privado y claves XTB en el servidor

## Respuestas rápidas

- **¿Se puede publicar sin acceso a internet?** No. Publicar en Lovable siempre genera una URL pública en internet. Lo que sí se puede es que esa URL no sirva nada sin contraseña: cualquiera que la encuentre solo verá una pantalla de acceso.
- **¿La app tiene registro/login hoy?** No. Ahora mismo hay una única página pública y las credenciales de XTB se escriben en el navegador y se guardan en la sesión del navegador.

## Qué se va a construir

### 1. Candado de contraseña única (server-side)

- Nueva página `/unlock` con un único campo de contraseña.
- La contraseña real vive como secreto del servidor (`SITE_PASSWORD`), nunca en el código ni en el navegador.
- La comparación se hace en el servidor con verificación de tiempo constante; el navegador nunca recibe la contraseña.
- Al acertar, se guarda una sesión cifrada en una cookie `httpOnly` (7 días), así que desde PC y móvil solo se introduce una vez.
- Todo el contenido del panel pasa a servirse solo cuando la sesión está desbloqueada: si no lo está, el servidor no envía ni datos ni la interfaz, redirige a `/unlock`.
- Botón "Bloquear" en la cabecera para cerrar la sesión al terminar.
- Protección contra fuerza bruta: retardo creciente y bloqueo temporal tras varios intentos fallidos desde la misma IP.

### 2. Claves de XTB como secreto del servidor

- Se guardan `XTB_USER_ID`, `XTB_PASSWORD` y `XTB_ACCOUNT_TYPE` (real/demo) como secretos del proyecto.
- Las funciones de servidor de XTB dejan de recibir credenciales desde el navegador y las leen del entorno.
- El panel de XTB deja de pedir usuario y contraseña: solo muestra el estado de la conexión, el tipo de cuenta y el interruptor de "ejecución real armada".
- Resultado: las claves nunca viajan por la red desde tu dispositivo, nunca se guardan en el navegador y nunca aparecen en la interfaz.

### 3. Endurecimiento adicional

- `robots.txt` en modo "no indexar" y `noindex` en la cabecera, para que la URL no aparezca en buscadores.
- Cabeceras `no-store` en las respuestas del panel.
- Sin registro público: no hay forma de crear cuentas, solo la contraseña que tú conoces.

## Detalles técnicos

- `SESSION_SECRET` se genera automáticamente (valor aleatorio, nunca visible); `SITE_PASSWORD`, `XTB_USER_ID`, `XTB_PASSWORD` los introduces tú en el formulario seguro de secretos.
- Nuevos ficheros: `src/lib/gate.functions.ts` (unlock/lock + guarda de sesión), `src/routes/unlock.tsx`.
- Cambios: `src/routes/index.tsx` (loader con guarda), `src/lib/xtb.functions.ts` (credenciales desde `process.env` dentro del handler), `src/hooks/useTradingBot.ts` y `src/components/desk/XtbPanel.tsx` (se elimina la entrada de credenciales), `src/routes/__root.tsx` (noindex), `public/robots.txt`.
- La sesión usa `useSession` de TanStack Start con cookie `httpOnly`, `secure`, `sameSite: lax`.

## Nota sobre 24/7

Con este despliegue el bot sigue operando solo mientras tengas una pestaña abierta con la sesión desbloqueada. Ejecución permanente 24/7 requiere el servidor propio del que hablamos antes; esto es la fase de prueba privada.
