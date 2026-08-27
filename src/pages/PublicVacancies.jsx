import React, { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, ChefHat, Clock3, MapPin, Phone, Send, UserRound, WalletCards } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { getBrandLogo } from '../lib/brandLogo'
import { useApp } from '../store/AppContext'

const TELEGRAM_URL = 'https://t.me/zarkebab_managerr'
const PHONE_HREF = 'tel:+998905095545'

const COPY = {
  uz: {
    back: 'Menyuga qaytish',
    eyebrow: 'Zar Kebab jamoasi',
    title: 'Biz bilan birga rivojlaning',
    intro: 'Mehmondo‘stlikni yaxshi ko‘radigan mas’uliyatli insonlarni jamoamizga taklif qilamiz.',
    openings: 'Ochiq ish o‘rinlari',
    waiter: 'Ofitsiant',
    waiterText: 'Mehmonlarga samimiy xizmat ko‘rsatish va zal jamoasi bilan ishlash.',
    cook: 'Oshpaz',
    cookText: 'Taomlarni standartlarimiz asosida sifatli va o‘z vaqtida tayyorlash.',
    cashier: 'Kassir',
    cashierText: 'Buyurtma va to‘lovlarni diqqat bilan boshqarish, mehmonlarga yordam berish.',
    fullTime: 'To‘liq ish kuni',
    tashkent: 'Toshkent',
    apply: 'Telegram orqali ariza',
    call: 'Qo‘ng‘iroq qilish',
    applyTitle: 'O‘zingiz haqingizda aytib bering',
    applyText: 'Qaysi lavozimga qiziqishingiz, tajribangiz va telefon raqamingizni Telegram orqali yuboring.',
    backToVacancies: 'Barcha ish o‘rinlari',
    responsibilities: 'Vazifalar',
    requirements: 'Talablar',
    positionDetails: 'Ish haqida',
    applyForRole: 'Ushbu lavozimga ariza',
  },
  ru: {
    back: 'Вернуться в меню',
    eyebrow: 'Команда Zar Kebab',
    title: 'Развивайтесь вместе с нами',
    intro: 'Приглашаем ответственных людей, которые любят гостеприимство и хотят стать частью нашей команды.',
    openings: 'Открытые вакансии',
    waiter: 'Официант',
    waiterText: 'Заботиться о гостях и работать вместе с командой зала.',
    cook: 'Повар',
    cookText: 'Качественно и вовремя готовить блюда по стандартам ресторана.',
    cashier: 'Кассир',
    cashierText: 'Внимательно работать с заказами и оплатой, помогать гостям.',
    fullTime: 'Полный рабочий день',
    tashkent: 'Ташкент',
    apply: 'Откликнуться в Telegram',
    call: 'Позвонить',
    applyTitle: 'Расскажите нам о себе',
    applyText: 'Напишите в Telegram, какая вакансия вас интересует, укажите опыт и номер телефона.',
    backToVacancies: 'Все вакансии',
    responsibilities: 'Обязанности',
    requirements: 'Требования',
    positionDetails: 'О вакансии',
    applyForRole: 'Откликнуться на вакансию',
  },
  en: {
    back: 'Back to menu',
    eyebrow: 'Zar Kebab team',
    title: 'Grow together with us',
    intro: 'We welcome responsible people who care about hospitality and want to become part of our team.',
    openings: 'Open positions',
    waiter: 'Waiter',
    waiterText: 'Create a welcoming guest experience and work closely with the service team.',
    cook: 'Cook',
    cookText: 'Prepare dishes with consistent quality and timing according to our standards.',
    cashier: 'Cashier',
    cashierText: 'Handle orders and payments carefully while helping guests.',
    fullTime: 'Full time',
    tashkent: 'Tashkent',
    apply: 'Apply on Telegram',
    call: 'Call us',
    applyTitle: 'Tell us about yourself',
    applyText: 'Message us on Telegram with the role you want, your experience, and your phone number.',
    backToVacancies: 'All vacancies',
    responsibilities: 'Responsibilities',
    requirements: 'Requirements',
    positionDetails: 'Position details',
    applyForRole: 'Apply for this role',
  },
}

const VACANCY_DETAILS = {
  uz: {
    waiter: {
      description: 'Ofitsiant mehmonni kutib oladi, menyuni tushuntiradi va xizmat davomida unga e’tibor beradi. Bu lavozim samimiy muloqot va jamoaviy ishni qadrlaydigan inson uchun.',
      responsibilities: ['Mehmonlarni kutib olish va buyurtmalarni aniq qabul qilish', 'Taom va ichimliklar haqida tushunarli ma’lumot berish', 'Stollar va xizmat hududini tartibli saqlash', 'Oshxona va kassir bilan bir jamoa bo‘lib ishlash'],
      requirements: ['O‘zbek yoki rus tilida ravon muloqot', 'Xushmuomalalik va mas’uliyat', 'Faol ish jadvaliga tayyorlik', 'Restorandagi tajriba afzallik beradi'],
    },
    cook: {
      description: 'Oshpaz retsept va standartlarimiz asosida taomlarni barqaror sifatda tayyorlaydi. Biz tozalik, tezlik va mahsulotga ehtiyotkor munosabatni qadrlaymiz.',
      responsibilities: ['Taomlarni texnologik kartalar asosida tayyorlash', 'Mahsulot sifati va porsiya standartini nazorat qilish', 'Ish joyi va uskunalarni toza saqlash', 'Buyurtmalarni oshxona jamoasi bilan o‘z vaqtida chiqarish'],
      requirements: ['Oshxonada ishlash tajribasi', 'Sanitariya va xavfsizlik qoidalarini bilish', 'Tez va tartibli ishlash qobiliyati', 'Jamoada ishlashga tayyorlik'],
    },
    cashier: {
      description: 'Kassir buyurtma va to‘lovlarni to‘g‘ri rasmiylashtiradi, mehmon savollariga yordam beradi va smena hisobini aniq yuritadi.',
      responsibilities: ['Buyurtmalar va to‘lovlarni diqqat bilan qabul qilish', 'Naqd va terminal operatsiyalarini to‘g‘ri yuritish', 'Mehmonlarga menyu va to‘lov bo‘yicha yordam berish', 'Smena yakunidagi hisoblarni topshirish'],
      requirements: ['Diqqatlilik va halollik', 'Oddiy hisob-kitob va POS tizimlari bilan ishlash ko‘nikmasi', 'O‘zbek yoki rus tilida muloqot', 'Kassadagi tajriba afzallik beradi'],
    },
  },
  ru: {
    waiter: {
      description: 'Официант встречает гостей, помогает разобраться в меню и внимательно сопровождает их на протяжении всего визита. Роль подойдёт тем, кто ценит живое общение и командную работу.',
      responsibilities: ['Встречать гостей и точно принимать заказы', 'Понятно рассказывать о блюдах и напитках', 'Поддерживать порядок на столах и в зоне обслуживания', 'Работать в связке с кухней и кассой'],
      requirements: ['Свободное общение на русском или узбекском языке', 'Вежливость и ответственность', 'Готовность к активному рабочему графику', 'Опыт в ресторане будет преимуществом'],
    },
    cook: {
      description: 'Повар готовит блюда стабильно высокого качества по нашим рецептам и стандартам. Для нас важны чистота, скорость и бережное отношение к продуктам.',
      responsibilities: ['Готовить блюда по технологическим картам', 'Контролировать качество продуктов и размер порций', 'Поддерживать чистоту рабочего места и оборудования', 'Вовремя отдавать заказы вместе с командой кухни'],
      requirements: ['Опыт работы на кухне', 'Знание санитарных норм и правил безопасности', 'Умение работать быстро и организованно', 'Готовность работать в команде'],
    },
    cashier: {
      description: 'Кассир корректно оформляет заказы и оплату, помогает гостям с вопросами и обеспечивает точность кассовой смены.',
      responsibilities: ['Внимательно принимать заказы и платежи', 'Правильно проводить наличные и терминальные операции', 'Помогать гостям с меню и вариантами оплаты', 'Сдавать точный отчёт по окончании смены'],
      requirements: ['Внимательность и честность', 'Базовые навыки расчётов и работы с POS', 'Общение на русском или узбекском языке', 'Опыт работы с кассой будет преимуществом'],
    },
  },
  en: {
    waiter: {
      description: 'The waiter welcomes guests, helps them understand the menu, and looks after their experience throughout the visit. This role suits someone who enjoys genuine communication and teamwork.',
      responsibilities: ['Welcome guests and take orders accurately', 'Explain dishes and drinks clearly', 'Keep tables and the service area organized', 'Coordinate closely with the kitchen and cashier'],
      requirements: ['Confident Uzbek or Russian communication', 'Friendly and responsible attitude', 'Comfort with an active work schedule', 'Restaurant experience is an advantage'],
    },
    cook: {
      description: 'The cook prepares consistently high-quality dishes using our recipes and standards. We value cleanliness, good timing, and careful handling of ingredients.',
      responsibilities: ['Prepare dishes from approved recipe cards', 'Control ingredient quality and portion standards', 'Keep the station and equipment clean', 'Complete orders on time with the kitchen team'],
      requirements: ['Professional kitchen experience', 'Knowledge of food safety and hygiene', 'Ability to work quickly and stay organized', 'A reliable team-oriented attitude'],
    },
    cashier: {
      description: 'The cashier records orders and payments accurately, helps guests with questions, and keeps each shift’s cash reporting correct.',
      responsibilities: ['Process orders and payments carefully', 'Handle cash and terminal transactions correctly', 'Help guests with menu and payment questions', 'Complete accurate end-of-shift reporting'],
      requirements: ['Attention to detail and integrity', 'Basic calculation and POS skills', 'Uzbek or Russian communication', 'Cashier experience is an advantage'],
    },
  },
}

export default function PublicVacancies() {
  const navigate = useNavigate()
  const { vacancyId } = useParams()
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const copy = COPY[lang] || COPY.en

  const details = VACANCY_DETAILS[lang] || VACANCY_DETAILS.en
  const positions = [
    { key: 'waiter', Icon: UserRound, title: copy.waiter, text: copy.waiterText, ...details.waiter },
    { key: 'cook', Icon: ChefHat, title: copy.cook, text: copy.cookText, ...details.cook },
    { key: 'cashier', Icon: WalletCards, title: copy.cashier, text: copy.cashierText, ...details.cashier },
  ]
  const selectedPosition = vacancyId ? positions.find(position => position.key === vacancyId) : null

  useEffect(() => {
    document.title = `${selectedPosition?.title || copy.openings} — Zar Kebab`
    document.documentElement.lang = lang
  }, [copy.openings, lang, selectedPosition?.title])

  function animatedNavigate(event, path) {
    event.preventDefault()
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      navigate(path)
      return
    }
    document.startViewTransition(() => {
      flushSync(() => navigate(path))
    })
  }

  function returnToMenu(event) {
    animatedNavigate(event, '/menu')
  }

  return (
    <div className="public-page-enter min-h-screen bg-[#FAFAF9] text-[#1F2937]">
      <header className="border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
          <Link to="/menu" onClick={returnToMenu} className="flex min-w-0 items-center gap-3">
            <img src={getBrandLogo(lang)} alt="Zar Kebab" className="h-11 w-auto object-contain sm:h-14" />
            <span className="hidden text-xs font-black uppercase tracking-[0.15em] text-[#ff5a00] sm:block">Zar Kebab</span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main>
        {selectedPosition ? (
          <>
            <section className="border-b border-orange-100 bg-[#FFF8F1]">
              <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 sm:py-14">
                <Link to="/vacancies" onClick={event => animatedNavigate(event, '/vacancies')} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#64748B] transition-colors hover:text-[#ff5a00]">
                  <ArrowLeft size={15} />{copy.backToVacancies}
                </Link>
                <div className="mt-8 flex max-w-3xl items-start gap-4 sm:gap-5">
                  <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-[#ff5a00] shadow-sm sm:h-16 sm:w-16"><selectedPosition.Icon size={27} /></span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff5a00]">{copy.eyebrow}</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{selectedPosition.title}</h1>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-[#64748B]">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2"><Clock3 size={14} />{copy.fullTime}</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2"><MapPin size={14} />{copy.tashkent}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div className="space-y-9">
                <div>
                  <h2 className="text-xl font-black">{copy.positionDetails}</h2>
                  <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-[#64748B]">{selectedPosition.description}</p>
                </div>
                <DetailList title={copy.responsibilities} items={selectedPosition.responsibilities} />
                <DetailList title={copy.requirements} items={selectedPosition.requirements} />
              </div>
              <aside className="rounded-[24px] border border-orange-100 bg-orange-50 p-6 lg:sticky lg:top-6">
                <h2 className="text-xl font-black">{copy.applyForRole}</h2>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#64748B]">{copy.applyText}</p>
                <div className="mt-5 space-y-3">
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff5a00] px-5 text-sm font-black text-white"><Send size={17} />{copy.apply}</a>
                  <a href={PHONE_HREF} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-5 text-sm font-black text-[#1F2937]"><Phone size={17} />{copy.call}</a>
                </div>
              </aside>
            </section>
          </>
        ) : (
          <>
        <section className="border-b border-orange-100 bg-[#FFF8F1]">
          <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
            <Link to="/menu" onClick={returnToMenu} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#64748B] transition-colors hover:text-[#ff5a00]">
              <ArrowLeft size={15} />{copy.back}
            </Link>
            <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
              <div className="max-w-3xl">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ff5a00]">{copy.eyebrow}</p>
                <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight text-[#1F2937] sm:text-5xl">{copy.title}</h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-[#64748B] sm:text-lg">{copy.intro}</p>
              </div>
              <div className="hidden border-l-2 border-[#ff5a00] pl-5 text-sm font-semibold leading-relaxed text-[#64748B] lg:block">
                <p>{copy.applyText}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{copy.openings}</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {positions.map(({ key, Icon, title, text }) => (
              <Link key={key} to={`/vacancies/${key}`} onClick={event => animatedNavigate(event, `/vacancies/${key}`)} className="group rounded-[24px] border border-[#E5E7EB] bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-orange-200 hover:shadow-lg">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#ff5a00] transition-colors group-hover:bg-[#ff5a00] group-hover:text-white"><Icon size={22} /></span>
                <h3 className="mt-5 text-xl font-black">{title}</h3>
                <p className="mt-2 min-h-16 text-sm font-medium leading-relaxed text-[#64748B]">{text}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-black text-[#64748B]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8FAFC] px-3 py-1.5"><Clock3 size={13} />{copy.fullTime}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8FAFC] px-3 py-1.5"><MapPin size={13} />{copy.tashkent}</span>
                </div>
                <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-[#ff5a00]">{copy.positionDetails}<ArrowRight size={14} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="px-4 pb-14 sm:px-6 sm:pb-20">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6 rounded-[28px] bg-orange-50 px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-black tracking-tight">{copy.applyTitle}</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#64748B] sm:text-base">{copy.applyText}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-shrink-0">
              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff5a00] px-5 text-sm font-black text-white shadow-lg shadow-orange-200"><Send size={17} />{copy.apply}</a>
              <a href={PHONE_HREF} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white px-5 text-sm font-black text-[#1F2937]"><Phone size={17} />{copy.call}</a>
            </div>
          </div>
        </section>
          </>
        )}
      </main>
    </div>
  )
}

function DetailList({ title, items }) {
  return (
    <div>
      <h2 className="text-xl font-black">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map(item => (
          <li key={item} className="flex items-start gap-3 text-sm font-medium leading-6 text-[#64748B] sm:text-base">
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-[#ff5a00]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
