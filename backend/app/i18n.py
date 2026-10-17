"""Message catalog (English, Spanish, Haitian Creole) for every sentence the API generates, plus locale-aware dates.

The request language lives in a contextvar (`current_lang`), set by `LanguageMiddleware` from the `X-Lang` header or a `lang` query parameter
on every /api request; `t()` and the date helpers default to it. Unknown or missing values mean English, never an error.

The English strings are authoritative. The Spanish and Haitian Creole translations were written by an AI assistant and have NOT been
reviewed by a native speaker; official names (M-DCPS, VPK, Step Up For Students, ...) are kept as written. Tests check that every key exists in
every language and that placeholders match, so a missing translation can never leak half-English text silently.
"""
from __future__ import annotations

import re
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date
from urllib.parse import parse_qs

LANGS = ("en", "es", "ht")

_current: ContextVar[str] = ContextVar("request_lang", default="en")


def normalize_lang(raw: str | None) -> str:
    """'es', 'ES', 'es-US', ' ht ' -> 'es' / 'ht'. Anything else (None, '', 'fr') -> 'en'."""
    if not raw:
        return "en"
    code = raw.split(",")[0].split(";")[0].strip().lower().replace("_", "-").split("-")[0]
    return code if code in LANGS else "en"


def current_lang() -> str:
    """Language of the request being served (English outside a request)."""
    return _current.get()


@contextmanager
def use_lang(lang: str | None):
    """Run a block in `lang` (None keeps the current language). Used e.g. to keep chat tools in English for grounding."""
    token = _current.set(normalize_lang(lang) if lang else _current.get())
    try:
        yield
    finally:
        _current.reset(token)


class LanguageMiddleware:
    """Pure-ASGI middleware: sets the request language from `?lang=` (wins) or the `X-Lang` header for /api routes, and marks responses
    `Vary: X-Lang` + `Content-Language` so caches never serve one language to another. Contextvars are copied into the threadpool that
    runs sync endpoints, so services see the language too."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api"):
            await self.app(scope, receive, send)
            return
        query = parse_qs(scope.get("query_string", b"").decode("latin-1")).get("lang")
        header = next((v.decode("latin-1") for k, v in scope.get("headers", []) if k == b"x-lang"), None)
        lang = normalize_lang(query[0] if query else header)

        async def send_with_lang(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"vary", b"X-Lang"))
                headers.append((b"content-language", lang.encode()))
                message = {**message, "headers": headers}
            await send(message)

        token = _current.set(lang)
        try:
            await self.app(scope, receive, send_with_lang)
        finally:
            _current.reset(token)

MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    "ht": ["janvye", "fevriye", "mas", "avril", "me", "jen", "jiyè", "out", "septanm", "oktòb", "novanm", "desanm"],
}


def date_text(d: date, lang: str | None = None) -> str:
    """'September 1, 2027' / '1 de septiembre de 2027' / '1ye septanm 2027'."""
    lang = lang if lang in LANGS else current_lang()
    m = MONTHS[lang][d.month - 1]
    if lang == "es":
        return f"{d.day} de {m} de {d.year}"
    if lang == "ht":
        return f"{'1ye' if d.day == 1 else d.day} {m} {d.year}"
    return f"{m} {d.day}, {d.year}"


def month_day_text(d: date, lang: str | None = None) -> str:
    """'September 1' / '1 de septiembre' / '1ye septanm'."""
    lang = lang if lang in LANGS else current_lang()
    m = MONTHS[lang][d.month - 1]
    if lang == "es":
        return f"{d.day} de {m}"
    if lang == "ht":
        return f"{'1ye' if d.day == 1 else d.day} {m}"
    return f"{m} {d.day}"


# key: (English, Spanish, Haitian Creole). {placeholders} must match across the three.
MESSAGES: dict[str, tuple[str, str, str]] = {
    "hedge": (
        " This is an estimate from age only: the {cutoff_md} cut-off depends on the exact birth date.",
        " Es solo una estimación basada en la edad: la fecha límite del {cutoff_md} depende de la fecha de nacimiento exacta.",
        " Sa a se yon estimasyon ki baze sou laj sèlman: dat limit {cutoff_md} la depann de dat nesans egzak la.",
    ),
    "child": ("Child {n}", "Niño {n}", "Timoun {n}"),
    # ---- grade / stage labels (what the child is doing in the planning year)
    "entering.infant": ("Infant care", "Cuidado infantil (bebé)", "Swen pou ti bebe"),
    "entering.toddler": ("Toddler care", "Cuidado infantil (niño pequeño)", "Swen pou timoun ki fèk kòmanse mache"),
    "entering.prek3": ("Pre-K 3", "Pre-K 3", "Pre-K 3"),
    "entering.vpk": ("VPK (Pre-K 4)", "VPK (Pre-K 4)", "VPK (Pre-K 4)"),
    "entering.kindergarten": ("Kindergarten", "Kínder", "Kindègatèn"),
    "entering.grade": ("Grade {n}", "Grado {n}", "Klas {n}"),
    "entering.past": ("Past 12th grade (typical)", "Después del 12.º grado (lo habitual)", "Apre 12yèm ane (anjeneral)"),
    "level.elementary": ("elementary", "primaria", "primè"),
    "level.middle": ("middle", "intermedia", "entèmedyè"),
    "level.high": ("high", "secundaria", "segondè"),
    # ---- eligibility
    "elig.vpk.label": ("Free VPK (Voluntary Prekindergarten)", "VPK gratuito (Prekínder Voluntario)", "VPK gratis (Prekindègatèn Volontè)"),
    "elig.k.label": ("Public kindergarten", "Kínder público", "Kindègatèn piblik"),
    "elig.vpk.eligible": (
        "Turns 4 on or before {cutoff}, so qualifies for free VPK in {year}.{hedge}",
        "Cumple 4 años el {cutoff} o antes, por lo que califica para el VPK gratuito en {year}.{hedge}",
        "Li fè 4 an anvan oswa nan dat {cutoff}, kidonk li kalifye pou VPK gratis pou ane eskolè {year}.{hedge}",
    ),
    "elig.vpk.later": (
        "Not 4 by {cutoff}. First qualifies for the {year} school year.{hedge}",
        "No cumple 4 años para el {cutoff}. Califica por primera vez en el año escolar {year}.{hedge}",
        "Li pa gen 4 an pou {cutoff}. Li kalifye pou premye fwa pou ane eskolè {year}.{hedge}",
    ),
    "elig.vpk.past": (
        "Already 5 or older on {cutoff}: past VPK age.{hedge}",
        "Ya tiene 5 años o más el {cutoff}: pasó la edad de VPK.{hedge}",
        "Li gen 5 an oswa plis deja nan dat {cutoff}: li pase laj VPK a.{hedge}",
    ),
    "elig.k.eligible": (
        "Turns 5 on or before {cutoff}, so can start kindergarten in {year}.{hedge}",
        "Cumple 5 años el {cutoff} o antes, por lo que puede empezar el kínder en {year}.{hedge}",
        "Li fè 5 an anvan oswa nan dat {cutoff}, kidonk li ka kòmanse kindègatèn pou ane eskolè {year}.{hedge}",
    ),
    "elig.k.later": (
        "Not 5 by {cutoff}. First qualifies for kindergarten in {year}.{hedge}",
        "No cumple 5 años para el {cutoff}. Califica por primera vez para el kínder en {year}.{hedge}",
        "Li pa gen 5 an pou {cutoff}. Li kalifye pou premye fwa pou kindègatèn nan ane eskolè {year}.{hedge}",
    ),
    # ---- checklist
    "care.title": ("Find licensed child care", "Busque cuidado infantil con licencia", "Chèche yon sant swen timoun ki gen lisans"),
    "care.detail": (
        "{n} early-learning providers are listed within 3 miles. Each listing shows its county license number and expiry; confirm a license is current with the facility, and ask about rates and ages served.",
        "Hay {n} proveedores de educación temprana registrados a menos de 3 millas. Cada ficha muestra el número de licencia del condado y su vencimiento; confirme con el centro que la licencia esté vigente y pregunte por las tarifas y las edades que atienden.",
        "{n} founisè edikasyon bonè nan lis la nan mwens pase 3 mil. Chak fich montre nimewo lisans konte a ak dat ekspirasyon; verifye ak sant lan si lisans lan toujou valab, epi mande sou pri yo ak laj timoun yo aksepte.",
    ),
    "planvpk.title": ("Plan for free VPK in {year}", "Planifique el VPK gratuito para {year}", "Planifye pou VPK gratis nan ane eskolè {year}"),
    "planvpk.detail": (
        "A child must turn 4 on or before {cutoff_md} of the program year. {explanation}",
        "Un niño debe cumplir 4 años el {cutoff_md} del año del programa o antes. {explanation}",
        "Yon timoun dwe fè 4 an anvan oswa nan dat {cutoff_md} ane pwogram nan. {explanation}",
    ),
    "prek3.title": ("Choose a Pre-K 3 program", "Elija un programa de Pre-K 3", "Chwazi yon pwogram Pre-K 3"),
    "prek3.detail": (
        "VPK starts at age 4, so a 3-year-old's program is usually paid for by the family: no dataset lists prices, so ask each provider. {n} providers are listed within 3 miles.",
        "El VPK comienza a los 4 años, por lo que el programa de un niño de 3 años normalmente lo paga la familia: ningún conjunto de datos publica precios, así que pregunte a cada proveedor. Hay {n} proveedores registrados a menos de 3 millas.",
        "VPK kòmanse a 4 an, kidonk pwogram yon timoun 3 an anjeneral se fanmi an ki peye l: pa gen done ki bay pri yo, kidonk mande chak founisè. {n} founisè nan lis la nan mwens pase 3 mil.",
    ),
    "vpkapply.title": ("Apply for free VPK", "Solicite el VPK gratuito", "Aplike pou VPK gratis"),
    "vpkapply.fallback": ("Ask the VPK provider how to register.", "Pregunte al proveedor de VPK cómo inscribirse.", "Mande founisè VPK a kijan pou enskri."),
    "vpkprov.title": (
        "Pick a VPK provider and confirm it takes VPK",
        "Elija un proveedor de VPK y confirme que acepta VPK",
        "Chwazi yon founisè VPK epi verifye si li aksepte VPK",
    ),
    "vpkprov.detail": (
        "Many early-learning providers and some public schools offer VPK. Ask whether it is a VPK provider and check that its license is current.",
        "Muchos proveedores de educación temprana y algunas escuelas públicas ofrecen VPK. Pregunte si es un proveedor de VPK y verifique que su licencia esté vigente.",
        "Anpil founisè edikasyon bonè ak kèk lekòl piblik ofri VPK. Mande si se yon founisè VPK epi verifye si lisans li a toujou valab.",
    ),
    "zoned.where": (
        "Your zoned {level} school is {school}.",
        "Su escuela {level} asignada por zona es {school}.",
        "Lekòl {level} ki asiyen pou adrès ou a se {school}.",
    ),
    "zoned.none": (
        "We could not find a zoned {level} school for this address.",
        "No encontramos una escuela {level} asignada por zona para esta dirección.",
        "Nou pa jwenn okenn lekòl {level} ki asiyen pou adrès sa a.",
    ),
    "zoned.title": ("Your zoned {level} school: {school}", "Su escuela {level} asignada por zona: {school}", "Lekòl {level} ki asiyen pou ou a: {school}"),
    "zoned.detail": (
        "{where} A zoned school is the default for this address; boundaries can change, so confirm with M-DCPS before enrolling.",
        "{where} La escuela asignada por zona es la predeterminada para esta dirección; los límites pueden cambiar, así que confirme con M-DCPS antes de inscribirse.",
        "{where} Lekòl ki asiyen pou zòn nan se opsyon pa defo pou adrès sa a; limit yo ka chanje, kidonk verifye ak M-DCPS anvan ou enskri.",
    ),
    "magnet.title": ("Apply for a magnet program (optional)", "Solicite un programa magnet (opcional)", "Aplike pou yon pwogram magnet (opsyonèl)"),
    "magnet.detail": (
        "{window} Even if you are zoned for a school, a magnet seat needs its own application. {how}",
        "{window} Aunque su hijo esté asignado por zona a una escuela, un cupo magnet requiere su propia solicitud. {how}",
        "{window} Menm si timoun nan asiyen nan yon lekòl pa zòn, yon plas magnet mande pwòp aplikasyon li. {how}",
    ),
    "magnetresults.title": ("Magnet results", "Resultados magnet", "Rezilta magnet"),
    "charter.title": ("Consider charter schools", "Considere las escuelas chárter", "Konsidere lekòl charter"),
    "private.title": ("Consider private schools", "Considere las escuelas privadas", "Konsidere lekòl prive"),
    "private.detail": (
        "No dataset lists private-school tuition or deadlines: ask each school. Florida scholarships may help; the guide below shows which nearby schools list each program.",
        "Ningún conjunto de datos publica la matrícula ni las fechas límite de las escuelas privadas: pregunte a cada escuela. Las becas de Florida pueden ayudar; la guía de abajo muestra qué escuelas cercanas figuran en cada programa.",
        "Pa gen done ki bay frè lekòl oswa dat limit lekòl prive yo: mande chak lekòl. Bous Florid yo ka ede; gid ki anba a montre ki lekòl tou pre ki nan lis chak pwogram.",
    ),
    # ---- transitions
    "trans.k": (
        "{who} is starting kindergarten in {year}: this is a year to choose a school.",
        "{who} empieza el kínder en {year}: es un año para elegir escuela.",
        "{who} ap kòmanse kindègatèn nan ane eskolè {year}: se yon ane pou chwazi yon lekòl.",
    ),
    "trans.6": (
        "{who} is moving up to middle school in {year}: this is a year to choose a school.",
        "{who} pasa a la escuela intermedia en {year}: es un año para elegir escuela.",
        "{who} ap monte nan lekòl entèmedyè nan ane eskolè {year}: se yon ane pou chwazi yon lekòl.",
    ),
    "trans.9": (
        "{who} is moving up to high school in {year}: this is a year to choose a school.",
        "{who} pasa a la escuela secundaria en {year}: es un año para elegir escuela.",
        "{who} ap monte nan lekòl segondè nan ane eskolè {year}: se yon ane pou chwazi yon lekòl.",
    ),
    "trans.vpk": (
        "{who} is starting VPK in {year}: this is a year to choose a provider.",
        "{who} empieza el VPK en {year}: es un año para elegir proveedor.",
        "{who} ap kòmanse VPK nan ane eskolè {year}: se yon ane pou chwazi yon founisè.",
    ),
    # ---- notes
    "note.age": (
        "Some children are planned from age only. Add a birth date for exact eligibility: both VPK and kindergarten depend on turning 4 or 5 by {cutoff_md}.",
        "Algunos niños se planifican solo con la edad. Agregue la fecha de nacimiento para una elegibilidad exacta: tanto el VPK como el kínder dependen de cumplir 4 o 5 años para el {cutoff_md}.",
        "Gen kèk timoun ki planifye ak laj sèlman. Ajoute dat nesans pou jwenn yon eligibilite egzak: tou de VPK ak kindègatèn depann de si timoun nan fè 4 oswa 5 an anvan {cutoff_md}.",
    ),
    "note.unconfirmed": (
        "Some steps rely on rules that are not yet confirmed against a district source (see the label on each step): confirm them with M-DCPS before acting.",
        "Algunos pasos se basan en reglas que aún no se han confirmado con una fuente del distrito (vea la etiqueta de cada paso): confírmelas con M-DCPS antes de actuar.",
        "Gen kèk etap ki baze sou règ ki poko konfime ak yon sous distrik la (gade etikèt chak etap): konfime yo ak M-DCPS anvan ou aji.",
    ),
    # ---- scholarship program names (the FLDOE flag labels they match stay in English)
    "program.eo_ftc": (
        "FES Educational Options and Florida Tax Credit",
        "FES Opciones Educativas (FES-EO) y Crédito Fiscal de Florida (FTC)",
        "FES Opsyon Edikasyonèl (FES-EO) ak Kredi Taks Florid (FTC)",
    ),
    "program.ua": ("FES Unique Abilities", "FES Habilidades Únicas (FES-UA)", "FES Kapasite Inik (FES-UA)"),
    "program.pep": ("Personalized Education Program (PEP)", "Programa de Educación Personalizada (PEP)", "Pwogram Edikasyon Pèsonalize (PEP)"),
    # ================================================================================================ API text (all routes)
    # ---- "not available" explanations on school fields: na.<field>.<case>.why / act.<next step>
    "na.stages.why": (
        "The county listing has no grade range for this school.",
        "El listado del condado no indica el rango de grados de esta escuela.",
        "Lis konte a pa endike ki gred lekòl sa a ofri.",
    ),
    "act.ask_grades": ("Ask the school which grades it serves.", "Pregunte a la escuela qué grados atiende.", "Mande lekòl la ki gred li ofri."),
    "na.grades.why": (
        "No grade range in the county listing.",
        "El listado del condado no indica el rango de grados.",
        "Lis konte a pa endike ki gred li ofri.",
    ),
    "act.ask_ages": ("Ask the facility which ages it serves.", "Pregunte al centro qué edades atiende.", "Mande sant lan ki laj timoun li aksepte."),
    "na.state_grade.none.why": (
        "The state published no A-F grade for this school ({reason}).",
        "El estado no publicó una calificación A-F para esta escuela ({reason}).",
        "Eta a pa pibliye okenn nòt A-F pou lekòl sa a ({reason}).",
    ),
    "na.state_grade.default_reason": (
        "new, small or ungraded",
        "nueva, pequeña o sin calificación",
        "nouvo, piti oswa san nòt",
    ),
    "act.ask_nograde": (
        "Ask the school why it has no grade.",
        "Pregunte a la escuela por qué no tiene calificación.",
        "Mande lekòl la poukisa li pa gen nòt.",
    ),
    "na.state_grade.nomatch.why": (
        "This school could not be matched to a state record.",
        "No se pudo vincular esta escuela con un registro estatal.",
        "Nou pa t ka asosye lekòl sa a ak yon dosye eta a.",
    ),
    "act.check_fldoe_grade": (
        "Check the school's grade on the FLDOE school grades site.",
        "Consulte la calificación de la escuela en el sitio de calificaciones escolares del FLDOE.",
        "Verifye nòt lekòl la sou sit nòt lekòl FLDOE a.",
    ),
    "na.state_grade.notloaded.why": (
        "State school grades have not been loaded into this service yet.",
        "Las calificaciones escolares estatales aún no se han cargado en este servicio.",
        "Nòt lekòl leta yo poko chaje nan sèvis sa a.",
    ),
    "act.see_fldoe_grades": (
        "See FLDOE's School Grades page or ask the school.",
        "Consulte la página de Calificaciones Escolares del FLDOE o pregunte a la escuela.",
        "Gade paj Nòt Lekòl FLDOE a oswa mande lekòl la.",
    ),
    "na.gains_ela.why": (
        "No ELA learning-gains figure for this school.",
        "No hay una cifra de avances de aprendizaje en ELA para esta escuela.",
        "Pa gen okenn chif pwogrè aprantisaj nan ELA pou lekòl sa a.",
    ),
    "na.gains_math.why": (
        "No math learning-gains figure for this school.",
        "No hay una cifra de avances de aprendizaje en matemáticas para esta escuela.",
        "Pa gen okenn chif pwogrè aprantisaj nan matematik pou lekòl sa a.",
    ),
    "act.ask_school": ("Ask the school.", "Pregunte a la escuela.", "Mande lekòl la."),
    "na.gains.notloaded.why": (
        "Learning-gains data has not been loaded into this service yet.",
        "Los datos de avances de aprendizaje aún no se han cargado en este servicio.",
        "Done pwogrè aprantisaj yo poko chaje nan sèvis sa a.",
    ),
    "act.see_fldoe_gains": (
        "See FLDOE's Learning Gains report or ask the school.",
        "Consulte el informe de Avances de Aprendizaje del FLDOE o pregunte a la escuela.",
        "Gade rapò Pwogrè Aprantisaj FLDOE a oswa mande lekòl la.",
    ),
    "na.state_only.why": (
        "State A-F grades and learning gains are published for public and charter schools only.",
        "Las calificaciones estatales A-F y los avances de aprendizaje se publican solo para escuelas públicas y chárter.",
        "Nòt leta A-F ak pwogrè aprantisaj yo pibliye sèlman pou lekòl piblik ak charter.",
    ),
    "act.ask_results": (
        "Ask the school about its academic results and accreditation.",
        "Pregunte a la escuela sobre sus resultados académicos y su acreditación.",
        "Mande lekòl la sou rezilta akademik li yo ak akreditasyon li.",
    ),
    "na.enrollment.why": (
        "No enrollment figure in the county listing.",
        "El listado del condado no indica la cantidad de estudiantes inscritos.",
        "Lis konte a pa bay nonb elèv ki enskri yo.",
    ),
    "na.tuition.private.why": (
        "No public dataset lists private-school tuition.",
        "Ningún conjunto de datos públicos indica la matrícula de las escuelas privadas.",
        "Pa gen okenn done piblik ki bay frè lekòl prive yo.",
    ),
    "act.ask_tuition": (
        "Ask the school for its tuition and fee schedule.",
        "Pida a la escuela su lista de matrícula y cuotas.",
        "Mande lekòl la lis frè lekòl ak lòt frè li yo.",
    ),
    "na.tuition.care.why": (
        "No public dataset lists child-care or pre-K tuition. Florida's VPK is free for eligible 4-year-olds.",
        "Ningún conjunto de datos públicos indica la matrícula del cuidado infantil ni del pre-K. El VPK de Florida es gratuito para los niños de 4 años que reúnen los requisitos.",
        "Pa gen okenn done piblik ki bay frè swen timoun oswa pre-K. VPK Florid la gratis pou timoun 4 an ki kalifye yo.",
    ),
    "act.ask_rates": (
        "Ask the facility for rates and whether it is a VPK provider.",
        "Pregunte al centro por las tarifas y si es un proveedor de VPK.",
        "Mande sant lan pri yo epi si li se yon founisè VPK.",
    ),
    "na.aftercare.why": (
        "No county or state dataset lists before/after-care hours or prices.",
        "Ningún conjunto de datos del condado o del estado indica los horarios ni los precios del cuidado antes o después de la escuela.",
        "Pa gen okenn done konte oswa eta ki bay lè oswa pri swen anvan ak apre lekòl.",
    ),
    "act.ask_care": (
        "Ask the school which care options it offers.",
        "Pregunte a la escuela qué opciones de cuidado ofrece.",
        "Mande lekòl la ki opsyon swen li ofri.",
    ),
    "na.magnet.unverified.why": (
        "Magnet status is only reported for schools whose catalog entry has been verified by hand.",
        "El estado magnet solo se informa para las escuelas cuya entrada en el catálogo se verificó manualmente.",
        "Nou rapòte estati magnet sèlman pou lekòl ki gen antre katalòg yo verifye alamen.",
    ),
    "act.check_magnets": (
        "Check miamimagnets.org or ask the school.",
        "Consulte miamimagnets.org o pregunte a la escuela.",
        "Gade miamimagnets.org oswa mande lekòl la.",
    ),
    "na.magnet.nonpublic.why": (
        "Magnet programs are an M-DCPS public-school feature.",
        "Los programas magnet son una característica de las escuelas públicas de M-DCPS.",
        "Pwogram magnet se yon karakteristik lekòl piblik M-DCPS.",
    ),
    "act.ask_programs": (
        "Ask the school about specialized programs.",
        "Pregunte a la escuela por sus programas especializados.",
        "Mande lekòl la sou pwogram espesyalize li yo.",
    ),
    "na.specialties.why": (
        "No program themes are recorded for this school.",
        "No hay temas de programas registrados para esta escuela.",
        "Pa gen okenn tèm pwogram ki anrejistre pou lekòl sa a.",
    ),
    "na.ese.why": (
        "No county or state dataset records special-education (ESE) services for this school; many schools offer them without being listed.",
        "Ningún conjunto de datos del condado o del estado registra servicios de educación especial (ESE) para esta escuela; muchas escuelas los ofrecen sin estar en la lista.",
        "Pa gen okenn done konte oswa eta ki anrejistre sèvis edikasyon espesyal (ESE) pou lekòl sa a; anpil lekòl ofri yo san yo pa nan lis la.",
    ),
    "act.ask_ese": (
        "Ask the school what ESE, IEP and 504 support it provides.",
        "Pregunte a la escuela qué apoyo de ESE, IEP y 504 ofrece.",
        "Mande lekòl la ki sipò ESE, IEP ak 504 li bay.",
    ),
    "na.scholarship.notloaded.why": (
        "Scholarship participation is not loaded for this school.",
        "La participación en becas no está cargada para esta escuela.",
        "Patisipasyon nan bous pa chaje pou lekòl sa a.",
    ),
    "act.ask_scholarship": (
        "Ask the school whether it accepts Step Up For Students or AAA scholarships.",
        "Pregunte a la escuela si acepta becas de Step Up For Students o AAA.",
        "Mande lekòl la si li aksepte bous Step Up For Students oswa AAA.",
    ),
    "na.scholarship.nonprivate.why": (
        "Private-school scholarships apply to private schools only.",
        "Las becas para escuelas privadas se aplican solo a escuelas privadas.",
        "Bous pou lekòl prive yo aplike sèlman pou lekòl prive.",
    ),
    "act.none_needed": (
        "No action needed for public or charter schools.",
        "No necesita hacer nada en las escuelas públicas o chárter.",
        "Pa gen anyen pou fè pou lekòl piblik oswa charter.",
    ),
    "na.phone.why": (
        "No phone number in the county listing.",
        "El listado del condado no incluye número de teléfono.",
        "Lis konte a pa gen nimewo telefòn.",
    ),
    "act.search_site": ("Search the school's website.", "Busque el sitio web de la escuela.", "Chèche sit entènèt lekòl la."),
    "na.website.why": (
        "No website in the county or state listing.",
        "Ni el listado del condado ni el del estado incluyen un sitio web.",
        "Ni lis konte a ni lis eta a pa gen sit entènèt.",
    ),
    "act.search_page": (
        "Search for the school's official page.",
        "Busque la página oficial de la escuela.",
        "Chèche paj ofisyèl lekòl la.",
    ),
    "na.license.why": (
        "No license details in the county listing.",
        "El listado del condado no incluye datos de la licencia.",
        "Lis konte a pa gen detay sou lisans lan.",
    ),
    "act.ask_license": (
        "Ask the facility for its license number.",
        "Pida al centro su número de licencia.",
        "Mande sant lan nimewo lisans li.",
    ),
    "rule.missing.why": ("No curated rule '{rule_id}'", "No hay una regla curada '{rule_id}'", "Pa gen okenn règ ki verifye alamen '{rule_id}'"),
    "rule.missing.action": ("Check dadeschools.net", "Consulte dadeschools.net", "Gade dadeschools.net"),
    # ---- match score (detail = audit line for each factor, reason = short phrase shown on the card)
    "score.zoned.detail": (
        "Zoned {level} school for this address",
        "Escuela {level} asignada por zona para esta dirección",
        "Lekòl {level} ki asiyen pou adrès sa a",
    ),
    "score.zoned.reason": (
        "Zoned {level} school for your address",
        "Escuela {level} asignada por zona para su dirección",
        "Lekòl {level} ki asiyen pou adrès ou a",
    ),
    "score.zoned.not": (
        "Not the zoned school for this address",
        "No es la escuela asignada por zona para esta dirección",
        "Se pa lekòl ki asiyen pou adrès sa a",
    ),
    "score.online": (
        "Online school: distance does not apply",
        "Escuela en línea: la distancia no aplica",
        "Lekòl sou entènèt: distans pa aplike",
    ),
    "score.distance.detail": (
        "{distance} of {radius} mi radius",
        "{distance} de {radius} mi de radio",
        "{distance} sou {radius} mi reyon",
    ),
    "score.distance.reason": ("{distance} mi away", "A {distance} mi de distancia", "{distance} mi lwen"),
    "score.grade.detail": (
        "State grade {grade} ({year})",
        "Calificación estatal {grade} ({year})",
        "Nòt leta {grade} ({year})",
    ),
    "score.grade.reason": ("State grade {grade}", "Calificación estatal {grade}", "Nòt leta {grade}"),
    "score.grade.none": (
        "No state grade available (not scored)",
        "No hay calificación estatal disponible (no se puntuó)",
        "Pa gen nòt leta disponib (pa konte nan nòt la)",
    ),
    "score.priorities.detail": (
        "{hits} of {total} priorities matched",
        "{hits} de {total} prioridades coinciden",
        "{hits} sou {total} priyorite matche",
    ),
    "score.priorities.reason": ("Matches your priority: {hits}", "Coincide con su prioridad: {hits}", "Matche priyorite ou: {hits}"),
    "score.scholarship.yes": ("Reports accepting scholarships", "Informa que acepta becas", "Rapòte ke li aksepte bous"),
    "score.scholarship.no": (
        "No scholarship participation recorded",
        "No hay participación en becas registrada",
        "Pa gen patisipasyon nan bous ki anrejistre",
    ),
    # ---- search notes
    "note.search.free_only": (
        "Free-only keeps public and charter schools. Private schools and child care are excluded because no dataset lists their prices; "
        "VPK (free pre-K for 4-year-olds) is offered by many providers, so ask facilities if they are a VPK provider.",
        "El filtro de solo gratis conserva las escuelas públicas y chárter. Las escuelas privadas y el cuidado infantil se excluyen porque ningún conjunto de datos indica sus precios; "
        "muchos proveedores ofrecen VPK (pre-K gratuito para niños de 4 años), así que pregunte a los centros si son proveedores de VPK.",
        "Filtre gratis sèlman kenbe lekòl piblik ak charter. Nou eskli lekòl prive ak swen timoun paske pa gen okenn done ki bay pri yo; "
        "anpil founisè ofri VPK (pre-K gratis pou timoun 4 an), kidonk mande sant yo si yo se founisè VPK.",
    ),
    "note.search.grade_min": (
        "A-F grades exist for public and charter schools only; schools without a grade are excluded when grade_min is set.",
        "Las calificaciones A-F existen solo para escuelas públicas y chárter; las escuelas sin calificación se excluyen cuando se define grade_min.",
        "Nòt A-F yo egziste sèlman pou lekòl piblik ak charter; nou eskli lekòl ki pa gen nòt lè grade_min defini.",
    ),
    "note.search.grade_min.nodata": (
        " FLDOE grades are not loaded in this deployment, so nothing can match.",
        " Las calificaciones del FLDOE no están cargadas en esta instalación, por lo que nada puede coincidir.",
        " Nòt FLDOE yo pa chaje nan enstalasyon sa a, kidonk anyen pa ka matche.",
    ),
    "note.search.ese": (
        "The ESE filter only returns schools where a county, state or directory signal exists. Many schools offer ESE services that no dataset records: ask schools directly.",
        "El filtro de ESE solo muestra escuelas con una señal del condado, del estado o de un directorio. Muchas escuelas ofrecen servicios de ESE que ningún conjunto de datos registra: pregunte directamente a las escuelas.",
        "Filtre ESE a montre sèlman lekòl ki gen yon siyal konte, eta oswa anyè. Anpil lekòl ofri sèvis ESE ki pa anrejistre nan okenn done: mande lekòl yo dirèkteman.",
    ),
    "note.search.specialties": (
        "Specialty matching uses hand-verified magnet themes where available, otherwise keywords in the official school name.",
        "La coincidencia por especialidad usa temas magnet verificados manualmente cuando existen; si no, palabras clave del nombre oficial de la escuela.",
        "Matche espesyalite a itilize tèm magnet yo verifye alamen lè yo egziste; sinon, mo kle nan non ofisyèl lekòl la.",
    ),
    "note.search.nograde": (
        "Some public/charter schools show no state grade because the state published none or the data is not loaded; they are not penalized in the score.",
        "Algunas escuelas públicas o chárter no muestran calificación estatal porque el estado no publicó ninguna o los datos no están cargados; no se penalizan en la puntuación.",
        "Gen kèk lekòl piblik/charter ki pa montre nòt leta paske eta a pa pibliye okenn oswa done yo pa chaje; sa pa bese nòt matche yo.",
    ),
    # ---- questions to ask the school
    "q.private.tuition": (
        "What is the annual tuition, and which fees (registration, books, uniforms, transportation) are extra?",
        "¿Cuál es la matrícula anual y qué cuotas (inscripción, libros, uniformes, transporte) son adicionales?",
        "Konbyen frè lekòl la pou ane a, e ki lòt frè (enskripsyon, liv, inifòm, transpò) ki an plis?",
    ),
    "q.private.scholarship": (
        "Do you accept Step Up For Students or AAA scholarships, and is there a waitlist?",
        "¿Aceptan becas de Step Up For Students o AAA y hay lista de espera?",
        "Èske nou aksepte bous Step Up For Students oswa AAA, e èske gen yon lis datant?",
    ),
    "q.care.ages": (
        "Which ages do you serve, and what are the weekly rates?",
        "¿Qué edades atienden y cuáles son las tarifas semanales?",
        "Ki laj timoun nou aksepte, e ki pri chak semèn?",
    ),
    "q.care.vpk": (
        "Are you a VPK provider, and is your license current?",
        "¿Son un proveedor de VPK y su licencia está vigente?",
        "Èske nou se yon founisè VPK, e èske lisans nou an toujou valab?",
    ),
    "q.care.hours": (
        "What are your hours, and what is your adult-to-child ratio?",
        "¿Cuál es su horario y cuál es la proporción de adultos por niño?",
        "Ki lè nou ouvri, e ki rapò granmoun pou timoun nou an?",
    ),
    "q.aftercare": (
        "Do you offer before- or after-school care? What hours does it run and what does it cost?",
        "¿Ofrecen cuidado antes o después de la escuela? ¿Qué horario tiene y cuánto cuesta?",
        "Èske nou ofri swen anvan oswa apre lekòl? Ki lè li fonksyone e konbyen li koute?",
    ),
    "q.ese": (
        "What services do you provide for students with an IEP or 504 plan (speech, OT, resource or inclusion classes)?",
        "¿Qué servicios ofrecen a los estudiantes con un IEP o un plan 504 (terapia del habla, terapia ocupacional, clases de recursos o de inclusión)?",
        "Ki sèvis nou bay elèv ki gen yon IEP oswa yon plan 504 (òtofoni, terapi okipasyonèl, klas resous oswa enklizyon)?",
    ),
    "q.magnet": (
        "Does this school house a magnet program, and what are its application requirements?",
        "¿Esta escuela tiene un programa magnet y cuáles son sus requisitos de solicitud?",
        "Èske lekòl sa a gen yon pwogram magnet, e ki kondisyon pou aplike?",
    ),
    "q.charter": (
        "When is your enrollment deadline and how does your lottery work?",
        "¿Cuál es su fecha límite de inscripción y cómo funciona su sorteo?",
        "Ki dat limit enskripsyon nou an e kijan tiraj nou an mache?",
    ),
    "q.nograde": (
        "Why does the school have no state grade (new school, grade span, or data pending)?",
        "¿Por qué la escuela no tiene calificación estatal (escuela nueva, rango de grados o datos pendientes)?",
        "Poukisa lekòl la pa gen nòt leta (nouvo lekòl, seri gred, oswa done ki poko disponib)?",
    ),
    "q.arrival": (
        "What are your arrival and dismissal times and procedures?",
        "¿Cuáles son los horarios y procedimientos de llegada y de salida?",
        "Ki lè ak ki pwosedi pou rive ak pou soti?",
    ),
    "q.tour": ("Can I tour the school, and when?", "¿Puedo visitar la escuela y cuándo?", "Èske mwen ka vizite lekòl la, e ki lè?"),
    # ---- school detail notes
    "note.detail.magnet": (
        "We have not verified whether this school has a magnet program, so the magnet steps are general. Confirm on miamimagnets.org.",
        "No hemos verificado si esta escuela tiene un programa magnet, por lo que los pasos del programa magnet son generales. Confirme en miamimagnets.org.",
        "Nou pa verifye si lekòl sa a gen yon pwogram magnet, kidonk etap magnet yo se jeneral. Konfime sou miamimagnets.org.",
    ),
    "note.detail.unconfirmed": (
        "Steps marked \"Not confirmed\" have not been independently confirmed; verify them with the district before relying on them.",
        "Los pasos marcados como \"No confirmado\" no se han confirmado de forma independiente; verifíquelos con el distrito antes de confiar en ellos.",
        "Etap ki make \"Pa konfime\" yo pa konfime avèk yon sous endepandan; verifye yo ak distrik la anvan ou konte sou yo.",
    ),
    # ---- compare
    "cmp.row.kind": ("Type", "Tipo", "Kalite"),
    "cmp.row.grades": ("Grades", "Grados", "Klas"),
    "cmp.row.distance_mi": ("Distance from your location", "Distancia desde su ubicación", "Distans depi kote ou ye a"),
    "cmp.row.zoned": ("Zoned for your address", "Asignada por zona a su dirección", "Asiyen pou adrès ou a pa zòn"),
    "cmp.row.state_grade": ("State school grade (A-F)", "Calificación estatal de la escuela (A-F)", "Nòt leta lekòl la (A-F)"),
    "cmp.row.gains_ela": ("ELA learning gains (%)", "Avances de aprendizaje en ELA (%)", "Pwogrè aprantisaj nan ELA (%)"),
    "cmp.row.gains_math": ("Math learning gains (%)", "Avances de aprendizaje en matemáticas (%)", "Pwogrè aprantisaj nan matematik (%)"),
    "cmp.row.enrollment": ("Enrollment", "Estudiantes inscritos", "Elèv ki enskri"),
    "cmp.row.tuition": ("Tuition", "Matrícula", "Frè lekòl"),
    "cmp.row.aftercare": ("Before & after care", "Cuidado antes y después de la escuela", "Swen anvan ak apre lekòl"),
    "cmp.row.is_magnet": ("Magnet program", "Programa magnet", "Pwogram magnet"),
    "cmp.row.specialties": ("Specializes in", "Se especializa en", "Espesyalize nan"),
    "cmp.row.ese": ("Special needs (ESE)", "Necesidades especiales (ESE)", "Bezwen espesyal (ESE)"),
    "cmp.row.scholarship": ("Scholarships", "Becas", "Bous"),
    "cmp.row.phone": ("Phone", "Teléfono", "Telefòn"),
    "cmp.row.website": ("Website", "Sitio web", "Sit entènèt"),
    "cmp.needs_location.why": ("Needs your location.", "Se necesita su ubicación.", "Sa mande kote ou ye a."),
    "cmp.needs_location.action": (
        "Provide lat/lon to compare distance and zoning.",
        "Proporcione lat/lon para comparar la distancia y la zona.",
        "Bay lat/lon pou konpare distans lan ak zòn nan.",
    ),
    "cmp.best_rule": (
        "higher is better (official numeric field)",
        "más alto es mejor (campo numérico oficial)",
        "pi wo se pi bon (chan nimerik ofisyèl)",
    ),
    "cmp.note.best": (
        "'Best' is only flagged on numeric official fields (learning gains). Other rows are shown side by side without ranking, because no official measure says which is better.",
        "'Mejor' solo se marca en los campos numéricos oficiales (avances de aprendizaje). Las demás filas se muestran lado a lado sin clasificación, porque ninguna medida oficial indica cuál es mejor.",
        "'Pi bon' make sèlman sou chan nimerik ofisyèl yo (pwogrè aprantisaj). Lòt ranje yo parèt kòt a kòt san klasman, paske pa gen okenn mezi ofisyèl ki di ki youn ki pi bon.",
    ),
    "cmp.note.location": (
        "Pass lat/lon to include distance and zoning.",
        "Envíe lat/lon para incluir la distancia y la zona.",
        "Voye lat/lon pou enkli distans lan ak zòn nan.",
    ),
    # ---- pathway
    "path.stage.infant_toddler": (
        "Infant & toddler care",
        "Cuidado de bebés y niños pequeños",
        "Swen pou ti bebe ak timoun piti",
    ),
    "path.stage.pre_k": ("Pre-K", "Prekínder (Pre-K)", "Prekindègatèn (Pre-K)"),
    "path.stage.elementary": ("Elementary (K-5)", "Primaria (K-5)", "Primè (K-5)"),
    "path.stage.middle": ("Middle (6-8)", "Intermedia (6-8)", "Entèmedyè (6-8)"),
    "path.stage.high": ("High (9-12)", "Secundaria (9-12)", "Segondè (9-12)"),
    "path.ages.infant_toddler": ("Ages 0-2", "Edades 0-2", "Laj 0-2"),
    "path.ages.pre_k": ("Ages 3-4", "Edades 3-4", "Laj 3-4"),
    "path.ages.middle": ("Grades 6-8", "Grados 6-8", "Klas 6-8"),
    "path.ages.high": ("Grades 9-12", "Grados 9-12", "Klas 9-12"),
    "path.estimate": (
        "Estimated from overlapping attendance zones. The county publishes no official feeder patterns; official zoning depends on your address when your child reaches that level.",
        "Estimado a partir de la superposición de zonas de asistencia. El condado no publica patrones oficiales de escuelas de origen; la zonificación oficial depende de su dirección cuando su hijo o hija llegue a ese nivel.",
        "Estimasyon ki baze sou zòn lekòl ki chevoche. Konte a pa pibliye okenn modèl ofisyèl lekòl ki alimante lòt lekòl; zonaj ofisyèl la depann de adrès ou lè pitit ou rive nan nivo sa a.",
    ),
    "path.note.free_only": (
        "Free-only hides private schools and child care because no dataset lists their prices.",
        "El filtro de solo gratis oculta las escuelas privadas y el cuidado infantil porque ningún conjunto de datos indica sus precios.",
        "Filtre gratis sèlman an kache lekòl prive ak swen timoun paske pa gen okenn done ki bay pri yo.",
    ),
    # ---- zones
    "zone.note": (
        "Attendance boundaries come from the county's published layer and can change; confirm your zoned school with M-DCPS before enrolling. "
        "A school listed here may serve other grades through a K-8 or 6-12 structure.",
        "Los límites de asistencia provienen de la capa publicada por el condado y pueden cambiar; confirme su escuela asignada por zona con M-DCPS antes de inscribirse. "
        "Una escuela de esta lista puede atender otros grados mediante una estructura K-8 o 6-12.",
        "Limit zòn lekòl yo soti nan kouch done konte a pibliye a e yo ka chanje; konfime lekòl ki asiyen pou ou a ak M-DCPS anvan ou enskri. "
        "Yon lekòl ki nan lis la ka sèvi lòt gred atravè yon estrikti K-8 oswa 6-12.",
    ),
    # ---- geocode
    "geo.zip.address": (
        "ZIP {zip} (inside the ZIP area, not a street address)",
        "Código ZIP {zip} (dentro del área del código ZIP, no es una dirección de calle)",
        "Kòd ZIP {zip} (anndan zòn kòd ZIP la, se pa yon adrès ri)",
    ),
    "geo.zip.note": (
        "Distances and attendance zones are approximate. Give a street address for exact zones.",
        "Las distancias y las zonas de asistencia son aproximadas. Indique una dirección de calle para obtener zonas exactas.",
        "Distans yo ak zòn lekòl yo apwoksimatif. Bay yon adrès ri pou jwenn zòn egzak.",
    ),
    # ---- dates
    "dates.note": (
        "Some dates are from a single secondary source or the project spec and are marked in each field's `method`; confirm them on dadeschools.net.",
        "Algunas fechas provienen de una sola fuente secundaria o de las especificaciones del proyecto y se indican en el `method` de cada campo; confírmelas en dadeschools.net.",
        "Gen kèk dat ki soti nan yon sèl sous segondè oswa nan espesifikasyon pwojè a e yo make yo nan `method` chak chan; konfime yo sou dadeschools.net.",
    ),
    # ---- chat (warnings and replacements shown to the family; the model's own answer follows `lang` through its prompt)
    "chat.warn.unknown_citation": ("removed unknown citation {id}", "se eliminó la cita desconocida {id}", "nou retire sitasyon enkoni {id}"),
    "chat.warn.no_citations": (
        "the answer carries no citations",
        "la respuesta no incluye citas",
        "repons lan pa gen okenn sitasyon",
    ),
    "chat.warn.rules": (
        "the answer makes application-rule claims but no rules lookup (get_dates/get_school) was made; treat them as unverified",
        "la respuesta afirma reglas de solicitud, pero no se consultaron las reglas (get_dates/get_school); trátelas como no verificadas",
        "repons lan fè afimasyon sou règ aplikasyon, men pa gen okenn rechèch règ (get_dates/get_school) ki fèt; konsidere yo kòm ki pa verifye",
    ),
    "chat.warn.unavailable": ("AI assistant unavailable: {reason}", "Asistente de IA no disponible: {reason}", "Asistan AI pa disponib: {reason}"),
    "chat.warn.length": (
        "the answer was cut off by the model's token limit",
        "la respuesta se cortó por el límite de tokens del modelo",
        "limit token modèl la koupe repons lan",
    ),
    "chat.warn.amounts": (
        "the first draft contained amounts not found in the data and was rewritten",
        "el primer borrador contenía montos que no están en los datos y se reescribió",
        "premye bouyon an te gen montan ki pa nan done yo e yo te reekri l",
    ),
    "chat.warn.amounts_redacted": (
        "; remaining ones were redacted",
        "; los montos restantes se ocultaron",
        "; nou kache montan ki rete yo",
    ),
    "chat.amount_unverified": ("[amount not verified]", "[monto no verificado]", "[montan pa verifye]"),
    # ---- errors: err.<code>.message / err.<code>.action (ApiError); err.http.<status> (generic HTTP errors)
    # ---- accounts
    "err.invalid_email.message": ("That email address does not look right.", "Esa dirección de correo no parece válida.", "Adrès imèl sa a pa sanble ki kòrèk."),
    "err.invalid_email.action": ("Check it for typos and try again.", "Revise que no tenga errores e inténtelo de nuevo.", "Verifye si pa gen fòt ladan l epi eseye ankò."),
    "err.email_taken.message": ("An account with this email already exists.", "Ya existe una cuenta con este correo.", "Gen yon kont ki deja egziste ak imèl sa a."),
    "err.email_taken.action": ("Sign in instead.", "Inicie sesión en su lugar.", "Konekte olye de sa."),
    "err.invalid_credentials.message": ("The email or password is not correct.", "El correo o la contraseña no son correctos.", "Imèl la oswa modpas la pa kòrèk."),
    "err.invalid_credentials.action": ("Try again, or create an account.", "Inténtelo de nuevo o cree una cuenta.", "Eseye ankò, oswa kreye yon kont."),
    "err.not_signed_in.message": ("You need to sign in first.", "Primero debe iniciar sesión.", "Ou dwe konekte anvan."),
    "err.not_signed_in.action": ("Sign in and try again.", "Inicie sesión e inténtelo de nuevo.", "Konekte epi eseye ankò."),
    "err.too_many_attempts.message": ("Too many sign-in attempts.", "Demasiados intentos de inicio de sesión.", "Twòp tantativ koneksyon."),
    "err.too_many_attempts.action": ("Wait about 15 minutes and try again.", "Espere unos 15 minutos e inténtelo de nuevo.", "Tann apeprè 15 minit epi eseye ankò."),
    "err.wrong_password.message": ("The password is not correct.", "La contraseña no es correcta.", "Modpas la pa kòrèk."),
    "err.wrong_password.action": ("Re-enter your current password.", "Vuelva a escribir su contraseña actual.", "Ekri modpas ou genyen kounye a ankò."),
    "err.saved_limit.message": ("You have reached the limit of 200 saved schools.", "Ha llegado al límite de 200 escuelas guardadas.", "Ou rive nan limit 200 lekòl ou ka sove."),
    "err.saved_limit.action": ("Remove one you no longer need, then save again.", "Quite una que ya no necesite y guarde de nuevo.", "Retire youn ou pa bezwen ankò, epi sove ankò."),
    "err.profile_too_large.message": ("The saved profile is too large.", "El perfil guardado es demasiado grande.", "Pwofil ou sove a twò gwo."),
    "err.profile_too_large.action": ("Remove some details and try again.", "Quite algunos detalles e inténtelo de nuevo.", "Retire kèk detay epi eseye ankò."),
    "err.bad_radius.message": (
        "radius_mi must be between 0 and 25.",
        "radius_mi debe estar entre 0 y 25.",
        "radius_mi dwe ant 0 ak 25.",
    ),
    "err.bad_radius.action": ("Try 3.", "Pruebe con 3.", "Eseye 3."),
    "err.bad_grade.message": (
        "grade_min must be one of A, B, C, D, F.",
        "grade_min debe ser A, B, C, D o F.",
        "grade_min dwe se youn nan A, B, C, D, F.",
    ),
    "err.bad_grade.action": ("Try 'B'.", "Pruebe con 'B'.", "Eseye 'B'."),
    "err.bad_stage.message": ("Unknown stage '{stage}'.", "Etapa desconocida '{stage}'.", "Etap enkoni '{stage}'."),
    "err.bad_stage.action": ("Use one of: {stages}.", "Use una de estas: {stages}.", "Itilize youn nan sa yo: {stages}."),
    "err.bad_sort.message": (
        "sort must be match, distance, grade or name.",
        "sort debe ser match, distance, grade o name.",
        "sort dwe se match, distance, grade oswa name.",
    ),
    "err.bad_sort.action": ("Try 'match'.", "Pruebe con 'match'.", "Eseye 'match'."),
    "err.bad_ids.message": ("Compare 1 to 3 schools.", "Compare de 1 a 3 escuelas.", "Konpare 1 a 3 lekòl."),
    "err.bad_ids.action": (
        "Send at most three distinct ids.",
        "Envíe como máximo tres identificadores distintos.",
        "Voye twa idantifyan diferan o maksimòm.",
    ),
    "err.school_not_found.message": (
        "No school with id '{id}'.",
        "No hay ninguna escuela con el identificador '{id}'.",
        "Pa gen okenn lekòl ki gen idantifyan '{id}'.",
    ),
    "err.school_not_found.action": (
        "Use an id returned by /api/schools.",
        "Use un identificador devuelto por /api/schools.",
        "Itilize yon idantifyan /api/schools bay.",
    ),
    "err.outside_county.message": (
        "That location is outside Miami-Dade County.",
        "Esa ubicación está fuera del condado de Miami-Dade.",
        "Kote sa a andeyò konte Miami-Dade.",
    ),
    "err.outside_county.action": (
        "Enter an address in Miami-Dade County.",
        "Escriba una dirección dentro del condado de Miami-Dade.",
        "Antre yon adrès nan konte Miami-Dade.",
    ),
    "err.outside_county.address.message": (
        "That address is outside Miami-Dade County, which this service covers.",
        "Esa dirección está fuera del condado de Miami-Dade, que es el que cubre este servicio.",
        "Adrès sa a andeyò konte Miami-Dade, ki konte sèvis sa a kouvri.",
    ),
    "err.outside_county.address.action": (
        "Enter an address or ZIP in Miami-Dade County.",
        "Escriba una dirección o código postal dentro del condado de Miami-Dade.",
        "Antre yon adrès oswa yon kòd postal nan konte Miami-Dade.",
    ),
    "err.query_too_short.message": (
        "Enter a street address or a ZIP code.",
        "Escriba una dirección de calle o un código postal.",
        "Antre yon adrès ri oswa yon kòd postal.",
    ),
    "err.query_too_short.action": (
        "Try '2250 NW 2nd Ave, Miami 33127' or '33127'.",
        "Pruebe con '2250 NW 2nd Ave, Miami 33127' o '33127'.",
        "Eseye '2250 NW 2nd Ave, Miami 33127' oswa '33127'.",
    ),
    "err.geocode_not_found.message": (
        "Could not find a location for '{q}'.",
        "No se pudo encontrar una ubicación para '{q}'.",
        "Nou pa t ka jwenn yon kote pou '{q}'.",
    ),
    "err.geocode_not_found.action": (
        "Try a full street address with ZIP (e.g. '2250 NW 2nd Ave, Miami 33127') or just a 5-digit ZIP code.",
        "Pruebe con una dirección completa con código postal (p. ej., '2250 NW 2nd Ave, Miami 33127') o solo con un código postal de 5 dígitos.",
        "Eseye yon adrès ri konplè ak kòd postal (pa egzanp, '2250 NW 2nd Ave, Miami 33127') oswa jis yon kòd postal 5 chif.",
    ),
    "err.no_planning_rules.message": (
        "The planning rules are not loaded.",
        "Las reglas de planificación no están cargadas.",
        "Règ planifikasyon yo pa chaje.",
    ),
    "err.no_planning_rules.action": ("Check data/curated/rules.json.", "Revise data/curated/rules.json.", "Verifye data/curated/rules.json."),
    "err.birth_date_in_future.message": (
        "A birth date cannot be in the future.",
        "La fecha de nacimiento no puede estar en el futuro.",
        "Dat nesans pa ka nan lavni.",
    ),
    "err.birth_date_in_future.action": (
        "Check the birth date or enter the child's age instead.",
        "Revise la fecha de nacimiento o ingrese la edad del niño.",
        "Verifye dat nesans lan oswa antre laj timoun nan olye de sa.",
    ),
    "err.no_location.message": ("No location yet.", "Aún no hay ubicación.", "Poko gen kote."),
    "err.no_location.action": (
        "Ask the family for an address or ZIP, then call geocode.",
        "Pida a la familia una dirección o código postal y luego llame a geocode.",
        "Mande fanmi an yon adrès oswa yon kòd postal, answit rele geocode.",
    ),
    "err.data_unavailable.message": (
        "The school database is not built yet.",
        "La base de datos de escuelas aún no está construida.",
        "Baz done lekòl yo poko konstwi.",
    ),
    "err.data_unavailable.action": (
        "Run `python -m app.ingest.build` on the server.",
        "Ejecute `python -m app.ingest.build` en el servidor.",
        "Egzekite `python -m app.ingest.build` sou sèvè a.",
    ),
    "err.invalid_request.action": ("See /docs for parameters.", "Consulte /docs para ver los parámetros.", "Gade /docs pou wè paramèt yo."),
    "err.http.400": ("Bad Request", "Solicitud no válida", "Demann pa valab"),
    "err.http.403": ("Forbidden", "Acceso denegado", "Aksè entèdi"),
    "err.http.404": ("Not Found", "No encontrado", "Pa jwenn"),
    "err.http.405": ("Method Not Allowed", "Método no permitido", "Metòd pa otorize"),
    "err.http.429": ("Too Many Requests", "Demasiadas solicitudes", "Twòp demann"),
    "err.http.500": ("Internal Server Error", "Error interno del servidor", "Erè entèn sèvè"),
    "err.http.503": ("Service Unavailable", "Servicio no disponible", "Sèvis pa disponib"),
    # ---- request-validation (422) messages, by pydantic error type; English requests keep pydantic's own wording
    "val.invalid": ("invalid value", "valor no válido", "valè pa valab"),
    "val.missing": ("Field required", "Campo obligatorio", "Chan obligatwa"),
    "val.number": ("Input should be a valid number", "Debe ser un número válido", "Dwe se yon nimewo valab"),
    "val.integer": ("Input should be a valid integer", "Debe ser un número entero válido", "Dwe se yon nonb antye valab"),
    "val.boolean": (
        "Input should be a valid boolean",
        "Debe ser un valor booleano válido (verdadero o falso)",
        "Dwe se yon valè booleyen valab (vre oswa fo)",
    ),
    "val.string": ("Input should be a valid string", "Debe ser un texto válido", "Dwe se yon tèks valab"),
    "val.list": ("Input should be a valid list", "Debe ser una lista válida", "Dwe se yon lis valab"),
    "val.date": ("Input should be a valid date (YYYY-MM-DD)", "Debe ser una fecha válida (AAAA-MM-DD)", "Dwe se yon dat valab (AAAA-MM-JJ)"),
    "val.json": ("JSON decode error", "El contenido no es un JSON válido", "Kontni an pa yon JSON valab"),
    "val.ge": (
        "Input should be greater than or equal to {limit}",
        "Debe ser mayor o igual que {limit}",
        "Dwe pi gran oswa egal a {limit}",
    ),
    "val.gt": ("Input should be greater than {limit}", "Debe ser mayor que {limit}", "Dwe pi gran pase {limit}"),
    "val.le": (
        "Input should be less than or equal to {limit}",
        "Debe ser menor o igual que {limit}",
        "Dwe pi piti oswa egal a {limit}",
    ),
    "val.lt": ("Input should be less than {limit}", "Debe ser menor que {limit}", "Dwe pi piti pase {limit}"),
    "val.too_short": ("Input is too short: at least {limit}", "Es demasiado corto: mínimo {limit}", "Li two kout: omwen {limit}"),
    "val.too_long": ("Input is too long: at most {limit}", "Es demasiado largo: máximo {limit}", "Li two long: maksimòm {limit}"),
    "val.literal": ("Input should be {expected}", "Debe ser {expected}", "Dwe se {expected}"),
    "val.or": ("or", "o", "oswa"),
    # ---- Field.method: how each value was obtained (shown in the hover tooltip). `source`, `url` and dataset titles stay English.
    # `verification: <level>` (m.rule) and the `Check:` marker (m.state_check) are parsed by code and by the frontend: they stay literal in every language.
    "m.na_default": (
        "Checked the datasets listed in `source`; no value found.",
        "Se revisaron los conjuntos de datos indicados en `source`; no se encontró ningún valor.",
        "Nou verifye done ki endike nan `source` yo; nou pa jwenn okenn valè.",
    ),
    "m.rule": (
        "Curated rule '{rule_id}'; verification: {level}",
        "Regla curada '{rule_id}'; verification: {level}",
        "Règ ki verifye alamen '{rule_id}'; verification: {level}",
    ),
    "m.stages": (
        "Parsed from the county grade range '{range}' (PK = pre-K, K = kindergarten)",
        "Obtenido del rango de grados del condado '{range}' (PK = pre-K, K = kínder)",
        "Soti nan seri gred konte a '{range}' (PK = pre-K, K = kindègatèn)",
    ),
    "m.stages_care": (
        "County lists licensed child care without an age range; infant-to-pre-K is assumed. Confirm ages with the facility.",
        "El condado lista los centros de cuidado infantil con licencia sin indicar un rango de edades; se asume de bebés a pre-K. Confirme las edades con el centro.",
        "Konte a bay lis sant swen timoun ki gen lisans san li pa endike seri laj; nou sipoze se depi ti bebe jiska pre-K. Konfime laj yo ak sant lan.",
    ),
    "m.grades": (
        "County grade-range attribute as published",
        "Atributo del rango de grados del condado, tal como se publica",
        "Atribi seri gred konte a, jan yo pibliye l",
    ),
    "m.distance": (
        "Straight-line (great-circle) miles from the searched location to the school's county-listed point; not a travel time",
        "Millas en línea recta (círculo máximo) desde la ubicación buscada hasta el punto de la escuela en el listado del condado; no es un tiempo de viaje",
        "Mil an liy dwat (gran sèk) depi kote yo chèche a rive nan pwen lekòl la nan lis konte a; se pa yon tan vwayaj",
    ),
    "m.distance.online": (
        ". This is an online school: the point is its office address, not a campus",
        ". Es una escuela en línea: el punto es la dirección de su oficina, no un campus",
        ". Se yon lekòl sou entènèt: pwen an se adrès biwo li, se pa yon kanpis",
    ),
    "m.zoned": (
        "Point-in-polygon of the searched location against the county attendance boundaries",
        "Ubicación buscada comparada con los límites de asistencia del condado (punto dentro de polígono)",
        "Kote yo chèche a konpare ak limit zòn lekòl konte a (pwen andedan poligòn)",
    ),
    "m.state_grade": (
        "State A-F school grade as published for {year}; joined on district 13 + school number",
        "Calificación escolar estatal A-F tal como se publicó para {year}; vinculada por distrito 13 + número de escuela",
        "Nòt lekòl leta A-F jan yo pibliye l pou {year}; asosye pa distrik 13 + nimewo lekòl",
    ),
    "m.latest_year": ("the latest year", "el último año disponible", "dènye ane a"),
    "m.state_check": (
        ". Check: the state lists this school number as '{state_name}', which differs from the county name '{name}' (match confidence {confidence}). Confirm it is the same school",
        ". Check: el estado registra este número de escuela como '{state_name}', que difiere del nombre del condado '{name}' (confianza de la coincidencia {confidence}). Confirme que sea la misma escuela",
        ". Check: eta a make nimewo lekòl sa a kòm '{state_name}', ki diferan de non konte a '{name}' (konfyans matche a {confidence}). Konfime se menm lekòl la",
    ),
    "m.gains_ela": (
        "Percent of students making ELA learning gains, as published",
        "Porcentaje de estudiantes con avances de aprendizaje en ELA, tal como se publica",
        "Pousantaj elèv ki fè pwogrè aprantisaj nan ELA, jan yo pibliye l",
    ),
    "m.gains_math": (
        "Percent of students making math learning gains, as published",
        "Porcentaje de estudiantes con avances de aprendizaje en matemáticas, tal como se publica",
        "Pousantaj elèv ki fè pwogrè aprantisaj nan matematik, jan yo pibliye l",
    ),
    "m.enrollment": (
        "County enrollment attribute (the county does not publish its reporting date)",
        "Atributo de estudiantes inscritos del condado (el condado no publica su fecha de reporte)",
        "Atribi elèv ki enskri konte a (konte a pa pibliye dat rapò li a)",
    ),
    "m.tuition_free": (
        "Public and charter schools in Florida do not charge tuition (fees for uniforms, aftercare or activities may apply)",
        "Las escuelas públicas y chárter de Florida no cobran matrícula (pueden aplicarse cuotas por uniformes, cuidado después de la escuela o actividades)",
        "Lekòl piblik ak charter nan Florid pa mande frè lekòl (kèk frè pou inifòm, swen apre lekòl oswa aktivite ka aplike)",
    ),
    "m.magnet_verified": (
        "Hand-verified against the magnet catalog by {who}",
        "Verificado manualmente con el catálogo magnet por {who}",
        "{who} verifye alamen ak katalòg magnet la",
    ),
    "m.project_member": ("a project member", "un miembro del proyecto", "yon manm pwojè a"),
    "m.themes": (
        "Magnet themes verified against the 2027-28 magnet catalog",
        "Temas magnet verificados con el catálogo magnet 2027-28",
        "Tèm magnet yo verifye ak katalòg magnet 2027-28 la",
    ),
    "m.keywords": (
        "Keyword found in the official school name (weak signal; not a verified program list)",
        "Palabra clave encontrada en el nombre oficial de la escuela (señal débil; no es una lista verificada de programas)",
        "Mo kle yo jwenn nan non ofisyèl lekòl la (siyal fèb; se pa yon lis pwogram verifye)",
    ),
    "m.ese_center": (
        "County classifies this site as a special center (type SPC)",
        "El condado clasifica este sitio como centro especial (tipo SPC)",
        "Konte a klase sit sa a kòm yon sant espesyal (kalite SPC)",
    ),
    "m.ese_flag": (
        "Self-reported in the FLDOE private school directory",
        "Informado por la propia escuela en el directorio de escuelas privadas del FLDOE",
        "Lekòl la menm ki rapòte sa nan anyè lekòl prive FLDOE a",
    ),
    "m.scholarship_flag": (
        "Scholarship participation flags self-reported in the FLDOE private school directory",
        "Indicadores de participación en becas informados por las propias escuelas en el directorio de escuelas privadas del FLDOE",
        "Endikatè patisipasyon nan bous lekòl yo menm rapòte nan anyè lekòl prive FLDOE a",
    ),
    "m.county_listing": ("County listing", "Listado del condado", "Lis konte a"),
    "m.license": (
        "License number and expiry as listed in the county child-care layer; confirm current status with the facility",
        "Número de licencia y vencimiento según la capa de cuidado infantil del condado; confirme el estado actual con el centro",
        "Nimewo lisans ak dat ekspirasyon jan yo make nan kouch swen timoun konte a; konfime estati aktyèl la ak sant lan",
    ),
    "m.nearby": (
        "Straight-line miles from the school's county-listed point to the facility's county-listed point",
        "Millas en línea recta desde el punto de la escuela en el listado del condado hasta el punto del establecimiento en el listado del condado",
        "Mil an liy dwat depi pwen lekòl la nan lis konte a rive nan pwen etablisman an nan lis konte a",
    ),
    "m.compare_kind": (
        "County layer the school was listed in",
        "Capa del condado en la que figuraba la escuela",
        "Kouch konte kote lekòl la te nan lis la",
    ),
    "m.path.nearest": (
        "Straight-line miles from your address; options are ordered by distance only",
        "Millas en línea recta desde su dirección; las opciones se ordenan solo por distancia",
        "Mil an liy dwat depi adrès ou; nou klase opsyon yo selon distans sèlman",
    ),
    "m.path.zone": (
        "Official {level} attendance zone for your address",
        "Zona de asistencia oficial de {level} para su dirección",
        "Zòn lekòl ofisyèl {level} pou adrès ou a",
    ),
    "m.path.estimated": (
        "Estimated: share of the area overlapping the earlier level's attendance zone. Not an official feeder pattern.",
        "Estimado: proporción del área que se superpone con la zona de asistencia del nivel anterior. No es un patrón oficial de escuelas de origen.",
        "Estimasyon: pòsyon zòn ki chevoche ak zòn lekòl nivo anvan an. Se pa yon modèl ofisyèl lekòl ki alimante lòt lekòl.",
    ),
    "m.plan.care_count": (
        "Count of county-listed child-care and Head Start sites within 3 miles of the address",
        "Cantidad de centros de cuidado infantil y Head Start del listado del condado a menos de 3 millas de la dirección",
        "Kantite sant swen timoun ak Head Start nan lis konte a nan mwens pase 3 mil de adrès la",
    ),
    "m.zone.pip": (
        "Point-in-polygon: the location falls inside the county {level} attendance boundary",
        "Punto dentro de polígono: la ubicación está dentro del límite de asistencia de {level} del condado",
        "Pwen andedan poligòn: kote a tonbe anndan limit zòn lekòl {level} konte a",
    ),
    "m.zone.shape": (
        "County {level} attendance boundary containing the location, simplified to about 5 m for display",
        "Límite de asistencia de {level} del condado que contiene la ubicación, simplificado a unos 5 m para mostrarlo",
        "Limit zòn lekòl {level} konte a ki gen kote a ladan l, senplifye a apeprè 5 m pou afichaj",
    ),
    "m.geo.county": (
        "Exact house number + street name match against county address points",
        "Coincidencia exacta de número de casa + nombre de calle con los puntos de dirección del condado",
        "Matche egzak nimewo kay + non ri ak pwen adrès konte a",
    ),
    "m.geo.census": (
        "Census address-range interpolation (fallback when the county point is not found)",
        "Interpolación del rango de direcciones del Censo (alternativa cuando no se encuentra el punto del condado)",
        "Entèpolasyon seri adrès Resansman an (opsyon altènatif lè yo pa jwenn pwen konte a)",
    ),
    "m.geo.zip": (
        "A point inside the county ZIP polygon",
        "Un punto dentro del polígono del código ZIP del condado",
        "Yon pwen anndan poligòn kòd ZIP konte a",
    ),
}

_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def placeholders(s: str) -> set[str]:
    return set(_PLACEHOLDER.findall(s))


def t(key: str, lang: str | None = None, **kw) -> str:
    """Look up a message in `lang` (default: the request language; unknown languages fall back to English) and fill its placeholders."""
    row = MESSAGES[key]
    lang = lang or current_lang()
    text = row[LANGS.index(lang)] if lang in LANGS else row[0]
    return text.format(**kw) if kw else text
