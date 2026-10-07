# Caramelo Raro Tournament Manager

## Especificación técnica inicial: MVP v0.1

**Estado:** propuesta para validación. Las decisiones tecnológicas y las capacidades de integraciones externas deben confirmarse antes de iniciar la implementación.

## 1. Objetivo

Ofrecer al organizador de Caramelo Raro una aplicación web cloud-first y mobile-first para preparar y administrar torneos desde el teléfono, con una experiencia funcional también en PC. El MVP debe reducir el trabajo repetitivo de convocar participantes, conocer su disponibilidad y definir una fecha, sin publicar información ni confirmar decisiones importantes sin autorización del organizador.

La primera entrega validará principalmente el flujo de un torneo VGC semanal individual. Su diseño contemplará otros tipos de torneo como plantillas futuras, sin prometer que sus reglas o integraciones estén implementadas en v0.1.

## 2. Usuarios

- **Organizador:** crea torneos, configura reglas, revisa disponibilidad, aprueba el horario y administra el estado y el historial. Es el único usuario autenticado del MVP.
- **Participante:** consulta una convocatoria y responde una encuesta mediante un enlace web para móvil. No necesita instalar una aplicación ni crear una cuenta.
- **Colaborador futuro:** otro organizador con permisos delegados; queda fuera de v0.1.

## 3. Problema que resuelve

La coordinación hoy requiere recopilar respuestas dispersas en conversaciones, compararlas manualmente, resolver empates, redactar mensajes y recordar acciones posteriores. Esto consume tiempo y aumenta el riesgo de comunicar horarios ambiguos, perder respuestas o dejar pasos de inscripción sin hacer.

El sistema centraliza la configuración del torneo, la disponibilidad y las decisiones; genera textos listos para revisar y conserva un registro consultable de torneos pasados.

## 4. Funcionalidades del MVP

1. Acceso privado para el organizador.
2. Crear un torneo desde la plantilla **VGC semanal individual**, con formato de Pokémon editable/seleccionable, reglas visibles —incluidos Open Team Sheet y Best of 3—, zona horaria, descripción y fechas candidatas.
3. Mantener los datos de reglas en la plantilla y guardar una copia de las reglas en cada torneo para que cambios futuros no alteren torneos existentes.
4. Generar una convocatoria preliminar con las reglas, el enlace a la encuesta y un texto revisable.
5. Crear una encuesta web pública mediante un enlace aleatorio no predecible. Presentar opciones de fecha y hora con zona horaria explícita; permitir que un participante envíe o actualice su respuesta. El MVP no necesita integrar una plataforma externa de encuestas.
6. Mostrar cantidad de respuestas, disponibilidad por opción y participantes sin respuesta cuando se conozcan. Proponer la opción con más disponibilidad y explicar el resultado; ante empate o datos insuficientes, pedir que el organizador elija o ajuste las opciones.
7. Requerir aprobación explícita antes de fijar el horario. Tras aprobarlo, generar el mensaje definitivo y mostrar los pasos manuales pendientes, como publicar en WhatsApp o completar el registro en Limitless.
8. Permitir copiar/compartir el mensaje y el enlace desde el teléfono. El envío automatizado de WhatsApp no es requisito de aceptación del MVP.
9. Listar torneos anteriores y consultar su configuración, decisión final, mensajes y estado.
10. Gestionar estados simples: borrador, recopilando disponibilidad, horario aprobado, anunciado, completado y cancelado.

**Fuera de alcance de v0.1:** VGC por equipos, TCG y torneos especiales plenamente operativos; bracket, emparejamientos, resultados y standings; notificaciones automáticas de WhatsApp; integración automática con Limitless; recordatorios programados y generación o envío autónomo mediante IA. La estructura de plantillas deberá permitir agregarlos después.

## 5. Funcionalidades futuras

- Plantillas VGC por equipos, TCG y eventos especiales con validación de sus reglas particulares.
- Integración oficial con WhatsApp Business Platform/Cloud API para mensajes elegibles, con consentimiento, plantillas aprobadas cuando correspondan, registro de entrega y manejo de webhooks.
- Investigación e integración de Limitless solo si existe API o mecanismo oficial autorizado y suficiente para el flujo requerido.
- Recordatorios configurables y automatizados, con vista previa y registro de entrega.
- Importación/exportación de participantes, reglas, torneos y resultados; gestión de inscripciones, cupos y lista de espera.
- Roles para varios organizadores y trazabilidad de cambios.
- Asistencia de IA para redactar y adaptar convocatorias, resumir respuestas o detectar ambigüedades, siempre con revisión humana antes de publicar o decidir.
- Analítica de asistencia, participación y horarios preferidos.

## 6. Flujo completo del sistema

1. El organizador inicia sesión y crea un torneo desde una plantilla.
2. Ajusta los datos del evento y valida el formato y las reglas aplicables. El sistema guarda una instantánea de reglas en el torneo.
3. Define las fechas y horas candidatas. La aplicación interpreta y muestra todas las horas en la zona horaria elegida, guardando internamente fechas con zona/offset inequívocos.
4. El sistema genera el texto de convocatoria y el enlace de encuesta. El organizador revisa el texto y lo comparte manualmente con la comunidad.
5. Los participantes abren el enlace desde el teléfono y envían o modifican su disponibilidad. El sistema agrega los resultados sin publicar información personal innecesaria.
6. La aplicación presenta el recuento por opción y recomienda la de mayor disponibilidad. Si hay empate, ninguna opción es viable o las respuestas son insuficientes, solicita una decisión o nueva configuración al organizador.
7. El organizador aprueba una opción. Hasta entonces, ninguna opción se considera confirmada.
8. El sistema prepara el anuncio definitivo y una lista de acciones. El organizador publica el mensaje y realiza el registro en Limitless de forma manual en v0.1; marca cada paso cuando lo complete.
9. El torneo queda en el historial. Al completarlo o cancelarlo, el organizador actualiza su estado.
10. En una versión posterior, los recordatorios e integraciones podrán ejecutarse con consentimiento y controles de entrega apropiados.

## 7. Arquitectura propuesta

### Propuesta inicial

Aplicación web responsive con TypeScript, desplegada en una plataforma cloud, con interfaz de organizador y páginas públicas de encuesta. Backend administrado para autenticación, base de datos relacional, reglas de acceso y, cuando se requiera, funciones serverless para operaciones privilegiadas y webhooks.

Para un MVP de portafolio, la opción inicial recomendada es **Next.js + Supabase + Vercel**, con repositorio GitHub y despliegue conectado a GitHub. Next.js permite compartir TypeScript entre interfaz y endpoints del servidor; Supabase ofrece PostgreSQL, autenticación y políticas de acceso; Vercel simplifica despliegues de Next.js. Esta combinación reduce operación de infraestructura y hace visibles conceptos útiles de APIs, base de datos y cloud. Debe comprobarse la compatibilidad de planes gratuitos, límites, región, suspensión por inactividad, cuotas y condiciones vigentes antes de adoptarla.

Las operaciones privilegiadas (por ejemplo, modificar estado o procesar callbacks de proveedores) deben ejecutarse del lado servidor. Aplicar mínimo privilegio y políticas de acceso en la base de datos; no exponer claves secretas en el cliente. Usar HTTPS, validación de entradas, protección contra abuso del enlace público y copias/exportaciones adecuadas al riesgo.

### Alternativas a evaluar

- **Cloudflare Pages/Workers + D1 o PostgreSQL administrado:** buen rendimiento global y despliegue serverless; puede reducir costo y latencia. D1 es SQLite distribuido, no PostgreSQL, y algunas integraciones o patrones de Next.js pueden requerir adaptación. Evitar escogerlo solo por el plan gratuito sin validar límites y necesidades relacionales.
- **SvelteKit, Remix u otro framework TypeScript:** alternativas válidas para la aplicación web. Elegir según experiencia del desarrollador, soporte del proveedor y facilidad de pruebas; Next.js tiene un ecosistema amplio, pero más convenciones y complejidad de framework.
- **Supabase frente a backend propio:** Supabase acelera autenticación y persistencia; un API propio sobre PostgreSQL da mayor control, pero requiere operar más componentes. No se justifica para validar v0.1 salvo que una limitación concreta lo exija.
- **Vercel frente a Cloudflare:** Vercel ofrece una ruta directa para Next.js; Cloudflare puede ser atractivo por costos y red, aunque conviene probar compatibilidad y observabilidad. La elección debe considerar límites y costos al superar el uso gratuito, no asumir gratuidad permanente.

GitHub, Codespaces y Copilot son herramientas de repositorio y desarrollo asistido, no dependencias de ejecución de la aplicación. Codespaces puede minimizar instalación local y Copilot apoyar el desarrollo, pero el código generado requiere revisión, pruebas y control de secretos. Los servicios gratuitos pueden imponer cuotas, límites, suspensión o cambios de condiciones; el diseño debe facilitar exportar datos y cambiar de proveedor.

## 8. Integraciones necesarias

- **GitHub:** control de versiones, issues, revisión de cambios y CI para ejecutar pruebas. No es necesario publicar datos de participantes en el repositorio.
- **Hosting web y base de datos:** una plataforma para desplegar la aplicación y un proveedor PostgreSQL/autenticación, sujetos a la evaluación anterior.
- **WhatsApp:** en v0.1, compartir manualmente texto/enlace. Para automatizar, verificar elegibilidad y requisitos de WhatsApp Business Platform/Cloud API, consentimiento, políticas de mensajería, disponibilidad regional, plantillas aprobadas, límites y costos. No automatizar WhatsApp Web ni recurrir a APIs no oficiales. No asumir que una API permite publicar libremente en un grupo comunitario: validar el caso exacto con la documentación y las capacidades oficiales.
- **Limitless:** antes de planificar una integración, verificar documentación, acceso, términos y endpoints oficiales vigentes. No inferir que existe una API pública ni automatizar el sitio por scraping o navegador. Si no hay mecanismo oficial adecuado, mantener como paso manual claramente visible.
- **Encuesta:** funcionalidad propia dentro de la aplicación en v0.1; no requiere integración con servicios de formularios.
- **Webhooks:** no son necesarios para el flujo inicial. Se incorporarán con autenticación/verificación de firma, idempotencia, reintentos y registro de eventos cuando haya un proveedor oficial que los use.

## 9. Modelo de datos preliminar

- **Organizer:** identidad del usuario organizador y preferencias, incluida zona horaria.
- **TournamentTemplate:** nombre, categoría, versión de plantilla, reglas predeterminadas y campos configurables.
- **Tournament:** título, tipo, plantilla/versionado, reglas en instantánea, formato, estado, zona horaria, opción aprobada, fechas y marcas de tiempo.
- **AvailabilityOption:** torneo, inicio y fin con zona/offset inequívocos, estado de vigencia.
- **Poll:** torneo, token público aleatorio almacenado de forma segura, apertura/cierre y estado.
- **ParticipantResponse:** encuesta, identificador/nombre opcional visible para el organizador, fecha de respuesta y posibles preferencias; restringir los datos personales al mínimo.
- **AvailabilitySelection:** respuesta y opción seleccionada; permitir actualizar la respuesta sin duplicar selecciones inconsistentes.
- **MessageDraft:** torneo, tipo de mensaje (convocatoria o anuncio definitivo), contenido generado, versión y fecha de revisión/aprobación.
- **ManualTask:** torneo, descripción del paso externo (p. ej. publicar mensaje o registrar en Limitless), estado, responsable y fecha de finalización.
- **AuditEvent (futuro o mínimo):** cambios relevantes de estado, aprobación y actor para diagnóstico y trazabilidad.

Las relaciones y restricciones finales se definirán antes de la implementación. No almacenar números de teléfono u otros datos que no sean necesarios para operar la encuesta.

## 10. Riesgos y limitaciones

- API, reglas de uso, costos y capacidades de WhatsApp y Limitless pueden cambiar o no cubrir el caso necesario.
- La API oficial de WhatsApp puede no permitir el tipo de difusión o interacción que usa la comunidad; el envío manual es el fallback del MVP.
- La zona horaria, cambios de horario estacional, formatos Pokémon y reglas competitivas pueden producir errores si se dejan como texto ambiguo. Reglas y formatos requieren revisión del organizador y versionado.
- La encuesta puede sufrir respuestas duplicadas, enlaces compartidos fuera del grupo, votos no representativos o cambios tardíos. Debe aclararse que el resultado es una recomendación, no una reserva ni garantía de asistencia.
- Los enlaces públicos pueden ser reenviados. Limitar datos recolectados, permitir cierre de encuesta y considerar controles antiabuso sin imponer registro a los participantes.
- Free tiers no garantizan disponibilidad, privacidad contractual, respaldo ni costo cero a escala. Revisar retención, región de datos, condiciones y recuperación antes de uso real.
- El texto generado puede contener omisiones o información desactualizada. No publicar automáticamente mensajes o reglas generados por IA.
- La aplicación organiza el torneo, pero no verifica automáticamente elegibilidad de equipos ni resultados en v0.1.

## 11. Partes que requieren aprobación humana

- Revisión de plantilla, formato, reglas, fechas candidatas y zona horaria antes de abrir la encuesta.
- Revisión y envío de la convocatoria a la comunidad.
- Elección del horario ante empate, falta de respuestas, disponibilidad insuficiente o cualquier ambigüedad.
- Aprobación explícita del horario final y del anuncio definitivo antes de publicarlo.
- Autorización y configuración de cualquier canal de mensajería, incluida la verificación de consentimiento y elegibilidad del caso de uso.
- Registro, publicación o cambios en Limitless hasta verificar una integración oficial apropiada.
- Resolución de cambios de reglas, cancelaciones, cambios de horario y correcciones de datos.

## 12. Partes que pueden automatizarse

- Crear borradores de convocatoria y anuncio desde datos estructurados de plantilla y torneo.
- Crear y cerrar la encuesta, validar respuestas y recalcular recuentos.
- Ordenar opciones por disponibilidad y proponer un resultado determinista, explicando empates y falta de información.
- Conservar el historial y presentar tareas manuales pendientes.
- En el futuro, programar recordatorios y enviar mensajes mediante canales oficiales configurados, con consentimiento, revisión, límites de frecuencia, registros y capacidad de cancelar.
- En el futuro, asistir con IA en redacción o análisis. La IA puede sugerir; las reglas deterministas y la aprobación humana controlan cambios y publicaciones.

## 13. Criterios de éxito del MVP

- Un organizador puede completar el flujo desde el teléfono y desde PC sin instalar software local.
- Puede crear un torneo VGC semanal individual y obtener una convocatoria y encuesta compartibles en menos de cinco minutos, excluyendo el tiempo de revisión.
- Un participante puede responder desde un navegador móvil sin crear una cuenta; puede actualizar su disponibilidad y el resultado se refleja correctamente.
- La recomendación coincide con el mayor número de respuestas para datos no empatados; empate y ausencia de respuestas suficientes se muestran sin seleccionar un ganador silenciosamente.
- El horario no se confirma ni el anuncio se publica sin acción explícita del organizador.
- La zona horaria se ve claramente y las opciones se interpretan consistentemente al guardar y mostrar.
- Los torneos terminados siguen consultables con sus reglas y decisión final originales.
- No se necesita WhatsApp ni Limitless para completar los criterios principales; las limitaciones y tareas manuales quedan visibles.
- Pruebas automatizadas cubren cálculo de disponibilidad, empates, transiciones de estado, permisos y conversión de zona horaria; CI ejecuta las pruebas relevantes en cada cambio.
- La versión piloto puede operar dentro de cuotas gratuitas comprobadas, con métricas básicas de uso y una ruta documentada de exportación de datos.

## 14. Tecnologías recomendadas y alternativas

| Área | Recomendación inicial | Alternativas y consideraciones |
|---|---|---|
| Lenguaje | TypeScript | JavaScript es más simple al inicio, pero TypeScript ayuda a mantener coherentes reglas, mensajes y datos entre cliente y servidor. |
| Aplicación web | Next.js responsive, con enfoque PWA opcional | SvelteKit o Remix reducen o cambian convenciones; comparar experiencia del equipo y despliegue antes de decidir. No hace falta una app nativa para el MVP. |
| Datos y autenticación | Supabase (PostgreSQL + Auth + políticas de acceso) | Backend propio con PostgreSQL ofrece control y más operación; Cloudflare D1 ofrece otra economía, pero cambia el modelo SQL. Verificar disponibilidad, región, límites y condiciones vigentes. |
| Hosting | Vercel para el primer despliegue Next.js | Cloudflare Pages/Workers puede reducir costos y ofrecer buen alcance, tras probar compatibilidad, límites de ejecución y observabilidad. |
| Repositorio y CI | GitHub, GitHub Actions | Alternativas Git equivalentes; mantener CI y protección de secretos con cualquier proveedor. |
| Desarrollo asistido | VS Code/Codespaces y GitHub Copilot como opciones | No son requisitos de producción. Codespaces minimiza instalación local; revisar costos/quotas. El uso de IA debe acompañarse de revisión, pruebas y documentación de decisiones. |
| Mensajería | Manual en v0.1; evaluar API oficial de WhatsApp después | No usar automatización no oficial. Confirmar primero que la plataforma permita el flujo deseado, y estimar costo y requisitos de consentimiento. |
| Limitless | Acción manual documentada en v0.1 | Integrar solo tras comprobar API/mecanismo oficial, términos y alcance; evitar scraping o automatización no autorizada. |
| Pruebas | Pruebas unitarias de reglas, integración de API/base de datos y pruebas end-to-end del flujo móvil | La herramienta concreta (por ejemplo, Vitest y Playwright) debe decidirse junto con el framework y el pipeline del repositorio. |

**Decisión pendiente antes de implementar:** confirmar el primer formato VGC exacto y sus reglas, la zona horaria predeterminada de la comunidad, el mecanismo de publicación habitual, y las condiciones actuales de WhatsApp, Limitless, hosting y base de datos. Las recomendaciones anteriores son una hipótesis práctica para validar, no compromisos de proveedor ni garantía de servicios gratuitos.