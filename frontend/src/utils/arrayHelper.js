export const addIfNotExists = (list, item, key = 'id') => {
    return list.find(el => el[key] === item[key]) ? list : [...list, item];
  };