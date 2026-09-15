export const EMPLOYEE_JOB_FUNCTIONS = [
  { value: 'waiter', en: 'Waiter', ru: 'Официант', uz: 'Ofitsiant' },
  { value: 'manager', en: 'Manager', ru: 'Менеджер', uz: 'Menejer' },
  { value: 'cook', en: 'Cook', ru: 'Повар', uz: 'Oshpaz' },
  { value: 'washer', en: 'Dishwasher', ru: 'Мойщик посуды', uz: 'Idish yuvuvchi' },
  { value: 'cleaner', en: 'Cleaner', ru: 'Уборщик', uz: 'Farrosh' },
  { value: 'hostess', en: 'Hostess', ru: 'Хостес', uz: 'Xostes' },
  { value: 'chef_cook', en: 'Head chef', ru: 'Шеф-повар', uz: 'Bosh oshpaz' },
]

export function employeeJobFunctionLabel(value, lang = 'en') {
  const job = EMPLOYEE_JOB_FUNCTIONS.find(item => item.value === value)
  return job ? job[lang] || job.en : ''
}
