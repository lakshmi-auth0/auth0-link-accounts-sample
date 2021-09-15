"use strict";
const debug = require("debug")("auth0-link-accounts-sample");
const rp = require("request-promise-native");
const axios = require('axios');
const { result } = require("lodash");

class Auth0Client {
  constructor() {
    this.mgmtApiToken = "";
  }

  async getToken() {
    if (this.mgmtApiToken) return this.mgmtApiToken;
    const opts = {
      method: "POST",
      uri: `${process.env.ISSUER_BASE_URL}/oauth/token`,
      json: {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "client_credentials",
        audience: `${process.env.ISSUER_BASE_URL}/api/v2/`,
      },
    };
    debug("getting mgmt api access_token...");
    const { access_token } = await rp(opts);
    debug("access_token recieved...");

    this.mgmtApiToken = access_token;
    return this.mgmtApiToken;
  }

  async request(options) {
    const token = await this.getToken();
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const opts = { ...options, headers };
    const body = await rp(opts);
    try {
      console.log("body=", JSON.parse(body));
      return JSON.parse(body);
    } catch (err) {
      debug("body parsing failed, returning unparsed body %o", body);
      return body;
    }
  }

  async getGraphQLUsers({sub,email}) {
    debug("searching maching users with email *%s* ... via the graphql endpoint", email);
    const token = await this.getToken();
    const body = {
      query: `
      query Query($usersQ: String) {
        users(q: $usersQ) {
          records {
            email
            name
            picture
            user_id
            identities {
              connection {
                enabled_clients {
                  name
                }
              }
            }
            roles {
              records {
                id
                name
                members {
                  pagination {
                    total
                  }
                }
              }
            }
            organizations {
              records {
                display_name
                branding {
                  logo_url
                }
              }
            }
          }
        }
      }
      `,
      variables: {
        usersQ: `email:${email}`
      }
    }
    const reslt = await axios.post(`${process.env.GRAPHQL_URL}`, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        domain: `${process.env.BASE_DOMAIN}`
      }
    })
    console.log(reslt.data)
    debug("query input parsed", JSON.stringify(reslt.data.data.users.records));
    return reslt.data.data.users.records;
   
    
  
  }

  async getUser(userId) {
    debug("getting user profile for *%s* from mgmt api...", userId);
    return await this.request({
      url: `${process.env.ISSUER_BASE_URL}/api/v2/users/${userId}`,
    });
  }

  async updateUser(userId, payload) {
    debug("updating %s with payload %o...", userId, payload);
    return await this.request({
      method: "PATCH",
      url: `${process.env.ISSUER_BASE_URL}/api/v2/users/${userId}`,
      json: payload,
    });
  }

  async getUsersWithSameVerifiedEmail({ sub, email }) {
    debug("searching maching users with email *%s* ...", email);
    return await this.request({
      url: `${process.env.ISSUER_BASE_URL}/api/v2/users`,
      qs: {
        search_engine: "v3",
        q: `email:"${email}" AND email_verified:true -user_id:"${sub}"`,
      },
    });
  }

  async linkAccounts(rootUserId, targetUserIdToken) {
    debug("linking...");
    return await this.request({
      url: `${process.env.ISSUER_BASE_URL}/api/v2/users/${rootUserId}/identities`,
      method: "POST",
      json: {
        link_with: targetUserIdToken,
      },
    });
  }

  /*
   * Unlinks Accounts
   * Unlinks targetUserId account from rootUserId account
   *
   * Example:
   *
   *  await auth0Client.unlinkAccounts('google-oauth2%7C115015401343387192604','sms','560ebaeef609ee1adaa7c551')
   *
   * @param {String} rootUserId
   * @param {String} targetUserProvider
   * @param {String} targetUserId
   * @api public
   */
  async unlinkAccounts(rootUserId, targetUserProvider, targetUserId) {
    debug("Unlinking %s from %s ...", targetUserId, rootUserId);
    return await this.request({
      method: "DELETE",
      url: `${process.env.ISSUER_BASE_URL}/api/v2/users/${rootUserId}/identities/${targetUserProvider}/${targetUserId}`,
    });
  }
}

module.exports = new Auth0Client();
