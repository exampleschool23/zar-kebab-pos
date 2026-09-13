const present = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
export function buildPdfCards(items, cards, categories, selected, lang, names, variants) {
  return items.filter(item => selected.includes(categories.some(c => c.id === item.category_id) ? item.category_id : '__other')).flatMap(item => {
    const recipes = Object.values(cards).filter(card => card.menu_item_id === item.id)
    return (recipes.length ? recipes : [null]).flatMap(card => {
      const variant = card?.variant_option_id ? variants(item).find(v => v.id === card.variant_option_id) : null
      if (card?.variant_option_id && !variant) return []
      return [{ item, card, name: names.item(item, lang) + (variant ? ` · ${variant.label}` : ''),
        category: names.category(categories.find(c => c.id === item.category_id), lang),
        price: variant ? (variant.price > 0 ? variant.price : present(item.price) ? Number(item.price) + variant.price_delta : null) : item.price,
        cost: variant ? item.variant_costs?.[variant.id] : item.cost_price }]
    })
  })
}


export function techCardOptionName(option, lang) {
  return option?.[`label_${lang}`] || option?.[`title_${lang}`] || option?.[`name_${lang}`]
    || option?.label || option?.title || option?.name || ''
}
