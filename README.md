# Proyecto Integrado: monitoreo del nivel de agua

Propuesta de un sistema para medir la distancia entre un sensor y la superficie del agua en un depósito, y avisar localmente cuando la lectura entra en rangos definidos. El proyecto parte de un prototipo con Arduino Uno y contempla, como evolución, conectividad y una aplicación móvil para consultar mediciones y alertas.

## Visión del producto

Ayudar a las personas responsables de un depósito a detectar cambios de nivel a tiempo mediante información clara y alertas comprensibles. Antes de usar el sistema en condiciones reales, es necesario calibrarlo para el depósito concreto y comprobar sus lecturas y alertas.

## Problema y usuarios

Sin una medición frecuente, un cambio en el nivel de agua puede advertirse tarde. El usuario principal es quien supervisa el depósito y necesita conocer su estado sin inspeccionarlo constantemente. La solución debe indicar también cuándo una lectura no es confiable; una distancia medida no equivale por sí sola a un porcentaje de agua.

## Estado y alcance

| Área | Estado documentado |
| --- | --- |
| Lectura local | Prototipo descrito con sensor HC-SR04 y Arduino Uno; usa un promedio móvil de cinco lecturas. |
| Alertas locales | Lógica descrita para LED RGB y buzzer, con pulsador para cambiar entre luz, sonido o ambos. |
| Validación | Pendiente: comparar lecturas con mediciones manuales, calibrar rangos y probar alertas y modos. |
| Conectividad y aplicación móvil | Propuestas para una fase posterior; no están implementadas en el prototipo documentado. |

Este repositorio contiene por ahora la documentación inicial del producto. Todavía no incluye el código del prototipo ni una aplicación ejecutable.

## Objetivo de la primera entrega

Contar con un prototipo local cuya medición y alertas se puedan demostrar y verificar en un depósito de prueba. Para dar esta entrega por aceptada se requiere:

1. Registrar lecturas del sensor y contrastarlas con mediciones manuales en distintos niveles.
2. Definir y documentar los rangos de alerta para el depósito utilizado.
3. Comprobar la señal visual, la sonora y el cambio entre los tres modos.
4. Identificar lecturas inválidas y mostrar un estado que no se confunda con una medición válida.
5. Documentar conexiones, alimentación y protección de los componentes frente al agua.

Los criterios anteriores son metas de validación; no se presentan como pruebas ya superadas.

## Prioridades del Product Owner

| Prioridad | Necesidad | Resultado esperado |
| --- | --- | --- |
| 1 | Medición confiable | Lecturas comparadas con una referencia manual y límites conocidos. |
| 2 | Alertas entendibles | Cada color y señal sonora tiene un significado documentado y comprobado. |
| 3 | Manejo de fallas | Una lectura inválida no genera una falsa sensación de seguridad. |
| 4 | Consulta remota | Evaluar conectividad y diseñar una aplicación que muestre la última medición, el estado de conexión y las alertas. |
| 5 | Historial y notificaciones | Definir estas funciones una vez validada la captura y la comunicación de datos. |

La consulta remota, el historial y las notificaciones forman parte de la evolución propuesta, no de la primera entrega.

## Componentes previstos para el prototipo

- Arduino Uno: procesa las lecturas y controla las alertas.
- Sensor ultrasónico HC-SR04: mide distancia hasta la superficie del agua.
- LED RGB y buzzer: presentan alertas locales.
- Pulsador: cambia el modo de aviso.

No se ha documentado control de bomba, válvula ni otro actuador. Cualquier incorporación de estos elementos necesitará diseño eléctrico y pruebas específicas.

## Forma de trabajo

El equipo organiza las tareas en un tablero Kanban con estados **Pendiente**, **En curso** y **Terminado**. El Product Owner ordena el trabajo según el valor para el usuario y revisa los criterios de aceptación; el equipo registra resultados de pruebas, problemas y decisiones en el repositorio. Los cambios de alcance se reflejan en el tablero y en esta documentación.

## Próximos pasos

1. Incorporar al repositorio el código fuente y el esquema de conexiones del prototipo.
2. Realizar la calibración y publicar evidencias de las pruebas de lectura y alertas.
3. Revisar el manejo de lecturas inválidas y los tiempos de espera del programa.
4. Definir requisitos de comunicación, seguridad y experiencia de uso para la futura aplicación móvil.

## Seguridad

Mantener los componentes eléctricos protegidos del agua. Si se incorpora comunicación remota, definir autenticación, protección de credenciales, cifrado y manejo de pérdida de conexión antes de habilitarla para usuarios.
