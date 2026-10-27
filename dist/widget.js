/* GESTEK · Botón de registro para la web de otro.
 *
 * Una línea en la página del organizador:
 *
 *   <script src="https://APP/widget.js"
 *           data-gestek-evento="mi-evento"
 *           data-texto="Registrarme"
 *           data-color="#E0B12B" data-color-2="#F2D66B" data-gradiente="135deg"
 *           data-color-texto="#12100B"
 *           data-radio="12" data-borde="0" data-color-borde="transparent"
 *           data-sombra="md" data-tamano="md"></script>
 *
 * Y aparece un botón que, al pulsarlo, abre el registro ENCIMA de su página.
 * El visitante no sale de la web donde estaba, que es justo lo que se pedía:
 * antes el botón lo mandaba a GESTEK en otra pestaña.
 *
 * ── Las tres reglas que gobiernan este archivo ────────────────────────────
 *
 * 1. **Sin dependencias y sin build.** Lo carga la web de otro, con sus
 *    propias librerías y su propio CSS. Nada de React, nada de fuentes, nada
 *    de hojas de estilo: todo va en estilos en línea, que ningún CSS ajeno
 *    puede pisar por especificidad.
 * 2. **No ensuciar la página anfitriona.** No se tocan sus estilos globales,
 *    no se registran atajos de teclado fuera de la ventana abierta, y al
 *    cerrar se deja todo como estaba —incluido el scroll, que es el detalle
 *    que más se nota cuando falta.
 * 3. **El pago sale fuera.** El formulario y la reserva ocurren dentro; el
 *    salto a la pasarela se abre en una pestaña de verdad, porque un checkout
 *    dentro de un iframe ajeno se rompe por las cookies de terceros, por el
 *    3-D Secure y por la redirección de vuelta.
 */
(function () {
  'use strict';

  /* De dónde salió este script: es el origen de la app, y con él se arma la
     URL del iframe. Leerlo del propio `src` evita que el organizador tenga que
     escribir el dominio dos veces y equivocarse en uno. */
  var script = document.currentScript;
  var ORIGEN = (function () {
    try { return new URL(script.src).origin; } catch (e) { return ''; }
  })();

  var TAMANOS = {
    sm: { padding: '8px 16px',  fuente: '14px' },
    md: { padding: '12px 22px', fuente: '15px' },
    lg: { padding: '16px 30px', fuente: '17px' },
  };

  var SOMBRAS = {
    no: 'none',
    sm: '0 1px 2px rgba(0,0,0,.16)',
    md: '0 6px 16px rgba(0,0,0,.20)',
    lg: '0 14px 34px rgba(0,0,0,.28)',
  };

  /* Cómo responde el botón al pasar por encima.
   *
   * Copiada de `src/lib/embed.js`, que es donde la ve el panel: este archivo
   * lo carga la web de otro y no puede importar nada. `tests/animacionDelBoton`
   * compara las dos listas — separadas, el panel enseñaría una animación y la
   * web del organizador haría otra, sin que fallara nada.
   *
   * Estilos en línea y no una hoja de estilos: la regla 2 de este archivo es
   * no ensuciar la página anfitriona. */
  var ANIMACIONES = {
    brillo: { filter: 'brightness(1.08)' },
    elevar: { transform: 'translateY(-2px)', filter: 'brightness(1.04)' },
    crecer: { transform: 'scale(1.04)' },
    latir : { filter: 'brightness(1.08)', pulso: true },
    no    : {},
  };

  /* Quien pidió que las cosas no se muevan, manda.
   *
   * Es una preferencia del sistema de quien mira, y para algunas personas no
   * es una preferencia estética: el movimiento les marea. Se respeta aquí y no
   * en el panel porque el panel no sabe quién va a visitar la web. Se queda el
   * cambio de brillo, que informa igual y no desplaza nada. */
  function quietoTodo() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function dato(el, nombre, porDefecto) {
    var v = el.getAttribute('data-' + nombre);
    return (v === null || v === '') ? porDefecto : v;
  }

  function configDe(el) {
    var slug = dato(el, 'gestek-evento', null) || dato(el, 'gestek-registro', null);
    return {
      slug      : slug,
      /* A que boleta lleva, y de donde viene. Los dos viajan en la URL del
         iframe: sin `boleta`, el boton abre la lista —lo de siempre— y con
         ella entra directo a esa, que es lo que permite poner «Comprar VIP»
         en una pagina y «Stand comercial» en otra. */
      boleta    : dato(el, 'boleta', ''),
      /* A que sub-evento lleva. Vacio = al registro del evento.
         El boton solo sabia abrir `/registro`, asi que la unica puerta que se
         podia pegar en otra web era la entrada principal: un taller con su
         propio formulario no tenia enlace desde fuera. */
      sesion    : dato(el, 'sesion', ''),
      origen    : dato(el, 'origen', ''),
      texto     : dato(el, 'texto', 'Registrarme'),
      color     : dato(el, 'color', '#E0B12B'),
      color2    : dato(el, 'color-2', ''),
      gradiente : dato(el, 'gradiente', '135deg'),
      colorTexto: dato(el, 'color-texto', '#12100B'),
      radio     : dato(el, 'radio', '12'),
      borde     : dato(el, 'borde', '0'),
      colorBorde: dato(el, 'color-borde', 'transparent'),
      sombra    : dato(el, 'sombra', 'md'),
      tamano    : dato(el, 'tamano', 'md'),
      ancho     : dato(el, 'ancho', 'auto'),
      /* Como responde al pasar por encima. `brillo` es lo que hacia antes: un
         boton ya pegado en una web sigue comportandose igual. */
      animacion : dato(el, 'animacion', 'brillo'),
      fuente    : dato(el, 'fuente', 'inherit'),
      titulo    : dato(el, 'titulo', 'Registro'),
      /* Que el formulario de dentro use la tipografía de esta web. Así no se
         ve "traído de fuera". Se puede apagar con data-heredar-fuente="0". */
      heredarFuente: dato(el, 'heredar-fuente', '1') !== '0',
    };
  }

  /* El fondo: un color, o dos y entonces es degradado. Se resuelve aquí y no
     en el CSS para que el organizador no tenga que saber escribir un
     `linear-gradient`. */
  function fondoDe(cfg) {
    if (!cfg.color2) return cfg.color;
    return 'linear-gradient(' + cfg.gradiente + ', ' + cfg.color + ', ' + cfg.color2 + ')';
  }

  /* ── De qué color es ESTA página ─────────────────────────────────────────
   *
   * El formulario de dentro decidía su tema con `prefers-color-scheme`, o sea
   * con el sistema operativo de QUIEN MIRA, mientras el fondo lo pone la web
   * anfitriona. Son dos cosas que no tienen por qué coincidir, y cuando no
   * coinciden el formulario queda ilegible: web azul noche + portátil en modo
   * claro = título casi negro sobre casi negro y campos color crema flotando.
   * Llegó en una foto de FESTECH, y nada había fallado: cada mitad hizo lo suyo.
   *
   * Se mira el fondo de VERDAD, subiendo por los padres hasta el primero que
   * pinte algo: un `<div>` sin fondo dentro de una sección azul es azul, y
   * preguntarle a él solo devuelve `rgba(0,0,0,0)`.
   *
   * Sin expresión regular a propósito: `getComputedStyle` siempre devuelve
   * `rgb(r, g, b)` o `rgba(r, g, b, a)`, así que partir por lo que no es
   * número basta — y este archivo se sirve tal cual a webs ajenas, donde un
   * patrón que no casa falla en silencio y nadie se entera. */
  function partesDeColor(c) {
    var i = String(c || '').indexOf('(');
    if (i < 0) return null;
    var v = String(c).slice(i + 1, String(c).indexOf(')')).split(/[^0-9.]+/);
    var n = [], k;
    for (k = 0; k < v.length; k++) if (v[k] !== '') n.push(Number(v[k]));
    return n.length >= 3 ? n : null;
  }

  function esquemaDeLaPagina() {
    var n = document.body, i = 0, v = null;
    while (n && i++ < 30) {
      var p = partesDeColor(getComputedStyle(n).backgroundColor);
      /* Casi transparente es transparente: un velo al 5 % no manda sobre lo
         que hay debajo, y tomarlo por el fondo da el color equivocado. */
      if (p && (p.length < 4 || p[3] > 0.5)) { v = p; break; }
      n = n.parentElement;
    }
    if (!v) return null;
    function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    /* Luminancia relativa de la WCAG, no el promedio de los tres canales: el
       verde pesa siete veces más que el azul para el ojo. */
    var L = 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
    return L < 0.18 ? 'oscuro' : 'claro';
  }

  function sombraDe(cfg) {
    /* Un valor conocido, o lo que haya escrito el organizador tal cual: quien
       quiera una sombra rara puede ponerla entera. */
    return Object.prototype.hasOwnProperty.call(SOMBRAS, cfg.sombra) ? SOMBRAS[cfg.sombra] : cfg.sombra;
  }

  function crearBoton(cfg) {
    var t = TAMANOS[cfg.tamano] || TAMANOS.md;
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = cfg.texto;

    var estilo = {
      display      : cfg.ancho === 'completo' ? 'block' : 'inline-block',
      width        : cfg.ancho === 'completo' ? '100%' : 'auto',
      padding      : t.padding,
      fontSize     : t.fuente,
      fontWeight   : '600',
      fontFamily   : cfg.fuente,
      lineHeight   : '1.2',
      color        : cfg.colorTexto,
      background   : fondoDe(cfg),
      border       : (parseInt(cfg.borde, 10) || 0) + 'px solid ' + cfg.colorBorde,
      borderRadius : (parseInt(cfg.radio, 10) || 0) + 'px',
      boxShadow    : sombraDe(cfg),
      cursor       : 'pointer',
      /* `transform` entra en la transición sólo si el organizador eligió una
         animación que lo use. Moverse dentro de la web de otro choca con las
         animaciones que esa web ya tenga, así que por defecto —`brillo`— sigue
         sin haber transformación ninguna. */
      transition   : 'filter .15s ease, box-shadow .15s ease, transform .15s ease',
      textDecoration: 'none',
      appearance   : 'none',
      margin       : '0',
    };
    for (var k in estilo) b.style[k] = estilo[k];

    /* La animación elegida. Si el nombre no existe —un `data-animacion` escrito
       a mano con una errata— se cae en `brillo`, que es lo de siempre: un botón
       que deja de responder al ratón parece roto. */
    var anim = Object.prototype.hasOwnProperty.call(ANIMACIONES, cfg.animacion)
      ? ANIMACIONES[cfg.animacion]
      : ANIMACIONES.brillo;
    var quieto = quietoTodo();

    b.addEventListener('mouseenter', function () {
      if (anim.filter) b.style.filter = anim.filter;
      /* El desplazamiento se salta con «reducir movimiento»; el brillo no. */
      if (anim.transform && !quieto) b.style.transform = anim.transform;
      /* Levantarse sin que la sombra crezca no se lee como levantarse: se
         queda en un salto seco. Sólo si ya tenía sombra — sobre un botón plano
         aparecería una de la nada. */
      if (anim.transform && !quieto && cfg.sombra !== 'no') b.style.boxShadow = SOMBRAS.lg;
    });
    b.addEventListener('mouseleave', function () {
      b.style.filter = '';
      b.style.transform = '';
      b.style.boxShadow = sombraDe(cfg);
    });

    /* El pulso, con la API de animaciones del navegador: una hoja de estilos
       con `@keyframes` habría que meterla en la página del organizador, y este
       archivo no toca su CSS.
       Un botón que late solo es lo que se pidió para llamar la atención; que
       lo haga contra la voluntad de quien pidió que nada se mueva, no. */
    if (anim.pulso && !quieto && typeof b.animate === 'function') {
      try {
        b.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }, { transform: 'scale(1)' }],
          { duration: 1600, iterations: Infinity, easing: 'ease-in-out' },
        );
      } catch (e) { /* Sin Web Animations, el botón se queda quieto y funciona igual. */ }
    }
    b.addEventListener('focus', function () { b.style.outline = '2px solid ' + cfg.color; b.style.outlineOffset = '2px'; });
    b.addEventListener('blur',  function () { b.style.outline = ''; });

    b.addEventListener('click', function () { abrir(cfg); });
    return b;
  }

  /* ── La ventana ───────────────────────────────────────────────────────── */

  var abierta = null;

  function abrir(cfg) {
    if (abierta) return;
    if (!cfg.slug) { console.error('[gestek] falta data-gestek-evento con el slug del evento.'); return; }

    var fid = 'gestek-registro-' + Math.random().toString(36).slice(2, 8);
    var scrollPrevio = document.body.style.overflow;
    var focoPrevio = document.activeElement;

    var fondo = document.createElement('div');
    fondo.setAttribute('role', 'dialog');
    fondo.setAttribute('aria-modal', 'true');
    fondo.setAttribute('aria-label', cfg.titulo);
    var f = {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      background: 'rgba(8,8,10,.72)',
      /* El desenfoque es lo que hace que la ventana se lea como una capa
         encima y no como un recuadro pegado. */
      backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', overflowY: 'auto',
      opacity: '0', transition: 'opacity .18s ease',
    };
    for (var k in f) fondo.style[k] = f[k];

    var caja = document.createElement('div');
    var c = {
      position: 'relative', width: '100%', maxWidth: '760px',
      background: 'transparent', borderRadius: '16px', overflow: 'hidden',
      transform: 'translateY(8px)', transition: 'transform .18s ease',
    };
    for (var k2 in c) caja.style[k2] = c[k2];

    var marco = document.createElement('iframe');
    var extra = '';
    if (cfg.boleta) extra += '&boleta=' + encodeURIComponent(cfg.boleta);
    if (cfg.origen) extra += '&origen=' + encodeURIComponent(cfg.origen);
    /* Con `sesion` el destino es la agenda acotada a ESE sub-evento, no el
       registro del evento. La agenda ya sabe inscribir y ya pinta el
       formulario propio de la sesion; lo que faltaba era poder apuntar a una
       sola desde fuera. Si el id no existe o la sesion se cerro, la agenda
       cae a la lista completa en vez de a una pantalla vacia: un boton viejo
       en una web ajena no puede convertirse en una puerta cerrada. */
    var seccion = cfg.sesion ? 'agenda' : 'registro';
    if (cfg.sesion) extra += '&sesion=' + encodeURIComponent(cfg.sesion);
    marco.src = ORIGEN + '/embed/' + encodeURIComponent(cfg.slug) + '/' + seccion + '?fid=' + fid + '&fondo=solido' + extra;
    marco.title = cfg.titulo;
    marco.setAttribute('allow', 'clipboard-write');
    var m = {
      width: '100%', border: '0', display: 'block',
      /* Alto de arranque: la mitad de la ventana. Se ajusta al primer aviso
         del contenido, y así no aparece un recuadro enorme y vacío mientras
         carga. */
      height: Math.min(560, Math.round(window.innerHeight * 0.6)) + 'px',
      background: 'transparent',
    };
    for (var k3 in m) marco.style[k3] = m[k3];

    /* La tipografía de esta página, para que el formulario de dentro la use y
       no parezca de otro sitio. Se manda al cargar el iframe y cada vez que
       él la pida (por si cargó antes de que montáramos el listener). */
    function enviarEstilo() {
      /* El color de la pagina se manda SIEMPRE; la tipografia solo si se pidio
         heredarla.
         Estaban las dos detras del mismo `return`, y son cosas distintas:
         `data-heredar-fuente="0"` quiere decir «usa tu propia letra», no «no me
         preguntes de que color soy». Con el aviso apagado, el formulario vuelve
         a decidir su tema por el sistema operativo de quien entra — o sea que
         una casilla de tipografia cambiaba el color del formulario, y solo en
         algunos ordenadores. */
      try {
        var msg = { gestek: 'estilo', fid: fid, esquema: esquemaDeLaPagina() };
        if (cfg.heredarFuente !== false) msg.fuente = getComputedStyle(document.body).fontFamily;
        marco.contentWindow.postMessage(msg, ORIGEN || '*');
      } catch (e) { /* el iframe aún no ha navegado */ }
    }
    marco.addEventListener('load', enviarEstilo);

    var cerrarBtn = document.createElement('button');
    cerrarBtn.type = 'button';
    cerrarBtn.setAttribute('aria-label', 'Cerrar');
    cerrarBtn.innerHTML = '&times;';
    var x = {
      position: 'absolute', top: '10px', right: '10px', zIndex: '2',
      width: '34px', height: '34px', lineHeight: '30px', fontSize: '22px',
      color: '#fff', background: 'rgba(0,0,0,.45)', border: '0',
      borderRadius: '999px', cursor: 'pointer', padding: '0',
    };
    for (var k4 in x) cerrarBtn.style[k4] = x[k4];

    caja.appendChild(cerrarBtn);
    caja.appendChild(marco);
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
      fondo.style.opacity = '1';
      caja.style.transform = 'translateY(0)';
    });

    function cerrar() {
      if (!abierta) return;
      abierta = null;
      window.removeEventListener('message', alMensaje);
      document.removeEventListener('keydown', alTeclado);
      fondo.style.opacity = '0';
      document.body.style.overflow = scrollPrevio;
      setTimeout(function () {
        if (fondo.parentNode) fondo.parentNode.removeChild(fondo);
        /* Devolver el foco a donde estaba: sin esto, quien navega con teclado
           acaba al principio de la página del organizador. */
        if (focoPrevio && focoPrevio.focus) { try { focoPrevio.focus(); } catch (e) { /* se fue del DOM */ } }
      }, 200);
    }

    function alTeclado(e) { if (e.key === 'Escape') cerrar(); }

    function alMensaje(e) {
      /* Sólo se escucha a nuestro propio iframe. Sin esta comprobación,
         cualquier otro script de la página podría cerrar la ventana o —peor—
         hacernos abrir la URL que quiera. */
      if (e.origin !== ORIGEN) return;
      var d = e.data;
      if (!d || typeof d !== 'object' || !d.gestek) return;
      if (d.fid && d.fid !== fid) return;

      if (d.gestek === 'pide-estilo') { enviarEstilo(); return; }

      if (d.gestek === 'alto' && d.alto) {
        var tope = Math.round(window.innerHeight * 0.92);
        marco.style.height = Math.min(d.alto, tope) + 'px';
        return;
      }
      if (d.gestek === 'abrir' && d.url) {
        /* El salto a la pasarela: pestaña de verdad, no dentro del recuadro.
           La ventana se queda abierta a propósito — quien vuelva del pago
           encuentra dónde estaba. */
        window.open(d.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (d.gestek === 'listo' || d.gestek === 'cerrar') cerrar();
    }

    fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });
    cerrarBtn.addEventListener('click', cerrar);
    window.addEventListener('message', alMensaje);
    document.addEventListener('keydown', alTeclado);

    abierta = { cerrar: cerrar };
  }

  /* ── Montaje ──────────────────────────────────────────────────────────── */

  function montar() {
    /* Dos formas de usarlo, y las dos hacen falta:
       · El script con `data-gestek-evento`: el botón sale donde esté el
         script. Es una línea y es lo que quiere el 90%.
       · Elementos con `data-gestek-registro`: el botón sale donde el
         organizador diga, y tantas veces como quiera. Hace falta cuando va
         dentro de un menú o repetido en varias secciones. */
    var contenedores = document.querySelectorAll('[data-gestek-registro]');
    for (var i = 0; i < contenedores.length; i++) {
      var el = contenedores[i];
      if (el.getAttribute('data-gestek-listo') === '1') continue;
      el.setAttribute('data-gestek-listo', '1');
      el.appendChild(crearBoton(configDe(el)));
    }

    if (script && script.getAttribute('data-gestek-evento')) {
      var cfg = configDe(script);
      var boton = crearBoton(cfg);
      /* Justo donde está la etiqueta del script: es donde el organizador la
         pegó y donde espera ver el botón. */
      if (script.parentNode) script.parentNode.insertBefore(boton, script.nextSibling);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }

  /* Por si el organizador quiere abrirlo desde su propio código —un enlace del
     menú, el final de un vídeo—: window.GestekRegistro.abrir('mi-evento'). */
  window.GestekRegistro = {
    abrir: function (slug, opciones) {
      var cfg = configDe(document.createElement('div'));
      cfg.slug = slug;
      for (var k in (opciones || {})) cfg[k] = opciones[k];
      abrir(cfg);
    },
    cerrar: function () { if (abierta) abierta.cerrar(); },
  };
})();
