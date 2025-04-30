/*
export const POST_API = {
    GET_POSTS: '/api/posts',
    GET_POST_BY_ID: (id) => `/api/posts/${id}`,
    CREATE_POST: '/api/posts/create',
};
*/
export const ROOM_API = {
    get_ROOMS: '/gamerooms/',
    CREATE_ROOMS: `/gamerooms/`,
    //rooms id값
    get_ROOMSID: (id) => `/gamerooms/${id}`,
    IS_OWNER: (id) => `/gamerooms/${id}/is-owner`,
    DELET_ROOMSID: (id) => `gamerooms/${id}`,
    get_ROOMSUSER: (id) => `/gamerooms/${id}/participants`,
    JOIN_ROOMS: (id) => `gamerooms/${id}/join`,
    LEAVE_ROOMS: (id) => `gamerooms/${id}/leave`,
    PLAY_ROOMS: (id) => `gamerooms/${id}/start`,
    END_ROOMS: (id) => `gamerooms/${id}/end`,
}
