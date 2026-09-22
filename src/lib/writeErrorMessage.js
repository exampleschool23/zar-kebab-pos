// Keep raw diagnostics in the console; operational messages must use the UI language.
const COPY = {
  en: {
    save: 'Could not save changes', payment: 'Payment failed', kitchen: 'Could not send the order',
    bill: 'This bill is already with the cashier. Ask the cashier to move it back to the table, then send the added items. Your cart has been kept.',
    permission: 'Your account does not have permission for this action. Ask a manager to check your access.',
    unknown: 'The operation could not be completed. Check the latest order or bill status before trying again. If this continues, contact a manager.',
    pending: 'The server has not confirmed whether the order was saved. Keep this cart open and use Send again to check the same submission. Do not create a second order.',
    timeout: 'The server response was lost or took too long. Check the latest saved status before trying again to avoid duplicating the operation.',
    session: 'Your session has expired. Sign in again, then check the order status before trying again.',
    identity: 'The signed-in account changed. Sign back in with the original account to recover this order safely.',
    closed: 'This order is already closed or unavailable. Refresh the table and check its status before creating another order.',
    unavailable: 'An item is no longer available. Remove unavailable items from the cart and try again.',
    mismatch: 'The payment amount no longer matches the bill. Refresh the bill, check the amounts, then try again.',
  },
  ru: {
    save: 'Не удалось сохранить изменения', payment: 'Не удалось провести оплату', kitchen: 'Не удалось отправить заказ',
    bill: 'Счёт уже у кассира. Попросите кассира вернуть его на стол, затем отправьте добавленные блюда. Корзина сохранена.',
    permission: 'У вашей учётной записи нет прав на это действие. Попросите руководителя проверить доступ.',
    unknown: 'Не удалось завершить операцию. Перед повторной попыткой проверьте актуальное состояние заказа или счёта. Если ошибка повторяется, обратитесь к руководителю.',
    pending: 'Сервер не подтвердил, сохранён ли заказ. Не закрывайте корзину и нажмите «Отправить» ещё раз для проверки той же отправки. Не создавайте второй заказ.',
    timeout: 'Ответ сервера потерян или задерживается. Перед повторной попыткой проверьте, сохранились ли изменения, чтобы не повторить операцию.',
    session: 'Сеанс завершён. Войдите снова и проверьте состояние заказа перед повторной попыткой.',
    identity: 'Учётная запись изменилась. Войдите под первоначальной учётной записью, чтобы безопасно восстановить заказ.',
    closed: 'Этот заказ уже закрыт или недоступен. Обновите стол и проверьте его состояние перед созданием нового заказа.',
    unavailable: 'Одно из блюд больше недоступно. Удалите недоступные блюда из корзины и попробуйте снова.',
    mismatch: 'Сумма оплаты больше не совпадает со счётом. Обновите счёт, проверьте суммы и попробуйте снова.',
  },
  uz: {
    save: 'O‘zgarishlarni saqlab bo‘lmadi', payment: 'To‘lovni amalga oshirib bo‘lmadi', kitchen: 'Buyurtmani yuborib bo‘lmadi',
    bill: 'Hisob allaqachon kassirga yuborilgan. Kassirdan hisobni stolga qaytarishni so‘rang, keyin qo‘shilgan taomlarni yuboring. Savatcha saqlanib qoldi.',
    permission: 'Hisobingizda bu amal uchun ruxsat yo‘q. Rahbardan kirish huquqlarini tekshirishni so‘rang.',
    unknown: 'Amalni yakunlab bo‘lmadi. Qayta urinishdan oldin buyurtma yoki hisobning joriy holatini tekshiring. Xato takrorlansa, rahbarga murojaat qiling.',
    pending: 'Server buyurtma saqlanganini tasdiqlamadi. Savatchani ochiq qoldiring va ayni yuborishni tekshirish uchun «Yuborish» tugmasini yana bosing. Ikkinchi buyurtma yaratmang.',
    timeout: 'Server javobi yo‘qoldi yoki kechikmoqda. Amal takrorlanmasligi uchun qayta urinishdan oldin o‘zgarishlar saqlanganini tekshiring.',
    session: 'Seans tugadi. Qayta kiring va qayta urinishdan oldin buyurtma holatini tekshiring.',
    identity: 'Tizimga kirgan hisob o‘zgardi. Buyurtmani xavfsiz tiklash uchun avvalgi hisob bilan qayta kiring.',
    closed: 'Bu buyurtma allaqachon yopilgan yoki mavjud emas. Yangi buyurtma yaratishdan oldin stolni yangilang va uning holatini tekshiring.',
    unavailable: 'Taomlardan biri endi mavjud emas. Mavjud bo‘lmagan taomlarni savatchadan olib tashlang va qayta urinib ko‘ring.',
    mismatch: 'To‘lov summasi hisobga mos kelmayapti. Hisobni yangilang, summalarni tekshiring va qayta urinib ko‘ring.',
  },
}

export function writeErrorReason(error) {
  const message = String(error?.message || error || '')
  if (error?.code === 'POS_KITCHEN_SUBMISSION_USER_CHANGED') return 'identity'
  if (error?.kitchenSubmissionUnresolved) return 'pending'
  if (error?.code === 'POS_BILL_WITH_CASHIER' || /Cashier access is required to move a bill back to its table/i.test(message)) return 'bill'
  if (/Payment amount mismatch/i.test(message)) return 'mismatch'
  if (/already paid|already closed|paid, completed, cancelled/i.test(message)) return 'closed'
  if (/unavailable.*menu|menu.*unavailable|archived|no longer available/i.test(message)) return 'unavailable'
  if (error?.code === '42501' || /permission denied|write access is required|row-level security/i.test(message)) return 'permission'
  if (/JWT|session.*expired|not authenticated/i.test(message) || error?.code === 'PGRST301') return 'session'
  if (error?.isPOSWriteTimeout || /TIMEOUT/.test(error?.code || '') || /timed out|too long|fetch|network/i.test(message)) return 'timeout'
  return 'unknown'
}

const CATEGORY_COPY = {
  en: {
    prefix: 'Could not save category',
    session: 'Your session has expired. Sign in again and check the saved category settings before retrying.',
    unknown: 'The category settings could not be saved. Your edits are still here. Reload the category to check what was saved before retrying.',
    staff: 'One of the selected accounts is no longer an active staff member. Reload the category and select active staff again.',
    roster: 'The staff list has not loaded. Wait for it to finish, or reopen the category if loading failed. Your selection has not been saved.',
    schema: 'The database needs an update before these category settings can be saved. Ask the administrator to apply the pending menu database update.',
    partial: 'Category details may already be saved; selected-user access was not confirmed. Reopen the category to check before retrying.',
  },
  ru: {
    prefix: 'Не удалось сохранить категорию',
    session: 'Сеанс истёк. Войдите снова и проверьте сохранённые настройки категории перед повторной попыткой.',
    unknown: 'Не удалось сохранить настройки категории. Ваши изменения сохранены в форме. Откройте категорию заново и проверьте сохранённые данные перед повторной попыткой.',
    staff: 'Одна из выбранных учётных записей больше не является активным сотрудником. Откройте категорию заново и выберите действующих сотрудников.',
    roster: 'Список сотрудников ещё не загружен. Дождитесь загрузки или откройте категорию заново при ошибке. Выбор не сохранён.',
    schema: 'Для сохранения этих настроек категории нужно обновить базу данных. Попросите администратора применить ожидающее обновление базы меню.',
    partial: 'Данные категории могли сохраниться; доступ выбранных сотрудников не подтверждён. Проверьте категорию перед повторной попыткой.',
  },
  uz: {
    prefix: 'Kategoriyani saqlab bo‘lmadi',
    session: 'Seans tugadi. Qayta kiring va qayta urinishdan oldin kategoriya sozlamalarini tekshiring.',
    unknown: 'Kategoriya sozlamalari saqlanmadi. O‘zgarishlaringiz shaklda turibdi. Qayta urinishdan oldin kategoriyani qayta ochib, saqlangan holatini tekshiring.',
    staff: 'Tanlangan hisoblardan biri endi faol xodim emas. Kategoriyani qayta oching va faol xodimlarni tanlang.',
    roster: 'Xodimlar ro‘yxati hali yuklanmagan. Yuklanishini kuting yoki xato bo‘lsa kategoriyani qayta oching. Tanlov saqlanmadi.',
    schema: 'Bu kategoriya sozlamalarini saqlash uchun ma’lumotlar bazasini yangilash kerak. Administratordan menyu bazasining kutilayotgan yangilanishini qo‘llashni so‘rang.',
    partial: 'Kategoriya ma’lumotlari saqlangan bo‘lishi mumkin; tanlangan xodimlar ruxsati tasdiqlanmadi. Qayta urinishdan oldin kategoriyani tekshiring.',
  },
}

export function formatWriteError(error, lang = 'en', actionType = '') {
  const copy = COPY[lang] || COPY.en
  if (actionType === 'ADD_CATEGORY' || actionType === 'UPDATE_CATEGORY') {
    const category = CATEGORY_COPY[lang] || CATEGORY_COPY.en
    const message = String(error?.message || '')
    const reason = writeErrorReason(error)
    const detail = error?.code === 'POS_CATEGORY_STAFF_NOT_LOADED' ? category.roster
      : /Category schedule overrides require staff profiles/i.test(message) ? category.staff
      : ['PGRST204', 'PGRST202', '42P01', '42703', '42883'].includes(error?.code) ? category.schema
      : reason === 'unknown' ? category.unknown
      : reason === 'session' ? category.session
      : copy[reason]
    return `${category.prefix}: ${detail}${error?.categoryDetailsSaved ? ` ${category.partial}` : ''}`
  }
  const prefix = actionType === 'MARK_ORDER_PAID' ? copy.payment : actionType === 'SEND_TO_KITCHEN' ? copy.kitchen : copy.save
  return `${prefix}: ${copy[writeErrorReason(error)]}`
}
