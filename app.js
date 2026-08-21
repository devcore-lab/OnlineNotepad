const qs =
  selector =>
    document.querySelector(
      selector
    );


const qsa =
  selector =>
    [
      ...document.querySelectorAll(
        selector
      )
    ];


const BROWSER_KEY =
  "zeropad_browser_id";


let me = null;

let currentNote = null;

let currentProject = null;


/*
=========================================================
BROWSER ID
=========================================================
*/

function browserId() {

  let id =
    localStorage.getItem(
      BROWSER_KEY
    );


  if (!id) {

    id =
      crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() +
          "-" +
          Math.random();


    localStorage.setItem(
      BROWSER_KEY,
      id
    );

  }


  return id;

}


/*
=========================================================
API
=========================================================
*/

async function api(
  url,
  options = {}
) {

  const opts = {
    ...options,

    credentials:
      "same-origin",

    headers: {
      ...(options.headers || {})
    }
  };


  if (
    opts.body !== undefined &&
    !opts.headers[
      "Content-Type"
    ]
  ) {

    opts.headers[
      "Content-Type"
    ] =
      "application/json";

  }


  const response =
    await fetch(
      url,
      opts
    );


  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  let data = {};


  if (
    contentType.includes(
      "application/json"
    )
  ) {

    data =
      await response
        .json()
        .catch(
          () => ({})
        );

  }


  if (!response.ok) {

    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );

  }


  return data;

}


/*
=========================================================
PAGES
=========================================================
*/

function showPage(id) {

  qsa(".page")
    .forEach(
      page => {

        page.classList.toggle(
          "active",
          page.id === id
        );

      }
    );


  history.replaceState(
    null,
    "",
    "#" + id
  );


  window.scrollTo(
    0,
    0
  );


  api(
    "/api/visit",
    {
      method: "POST",

      body:
        JSON.stringify({
          browserId:
            browserId(),

          page: id
        })
    }
  ).catch(
    () => {}
  );


  if (
    id === "code"
  ) {

    refreshCodeGate();

  }


  if (
    id === "advertise"
  ) {

    refreshAdsDashboard();

  }


  if (
    id === "account"
  ) {

    refreshAccount();

  }

}


qsa("[data-page]")
  .forEach(
    button => {

      button.onclick =
        () =>
          showPage(
            button.dataset.page
          );

    }
  );


if (qs("#year")) {

  qs("#year")
    .textContent =
      new Date()
        .getFullYear();

}


/*
=========================================================
GET CURRENT USER
=========================================================
*/

async function refreshMe() {

  try {

    const data =
      await api(
        "/api/me"
      );


    me =
      data.user ||
      null;

  } catch (error) {

    console.error(
      error
    );

    me = null;

  }


  return me;

}


/*
=========================================================
ACCOUNT SCREEN
=========================================================
*/

async function refreshAccount() {

  await refreshMe();


  const authBox =
    qs("#authBox");


  const userBox =
    qs("#userBox");


  if (authBox) {

    authBox.classList.toggle(
      "hidden",
      Boolean(me)
    );

  }


  if (userBox) {

    userBox.classList.toggle(
      "hidden",
      !me
    );

  }


  if (
    me &&
    qs("#welcome")
  ) {

    qs("#welcome")
      .textContent =

        me.display_name

          ? `Hello, ${me.display_name}`

          : `Logged in as ${me.email}`;

  }

}


/*
=========================================================
REGISTER
=========================================================
*/

const registerForm =
  qs("#registerForm");


if (registerForm) {

  registerForm.onsubmit =
    async event => {

      event.preventDefault();


      const message =
        qs("#authMessage");


      if (message) {

        message.textContent =
          "Creating account...";

      }


      const form =
        new FormData(
          registerForm
        );


      const email =
        String(
          form.get("email") ||
          ""
        ).trim();


      const password =
        String(
          form.get(
            "password"
          ) || ""
        );


      const displayName =
        String(
          form.get(
            "displayName"
          ) ||
          form.get(
            "display_name"
          ) ||
          ""
        ).trim();


      try {

        const data =
          await api(
            "/api/register",
            {

              method:
                "POST",

              body:
                JSON.stringify({

                  email,

                  password,

                  displayName

                })

            }
          );


        me =
          data.user;


        if (message) {

          message.textContent =
            "Account created. You are now logged in.";

        }


        registerForm.reset();


        await refreshAccount();


      } catch (error) {

        if (message) {

          message.textContent =
            error.message;

        }

      }

    };

}


/*
=========================================================
LOGIN
=========================================================
*/

const loginForm =
  qs("#loginForm");


if (loginForm) {

  loginForm.onsubmit =
    async event => {

      event.preventDefault();


      const message =
        qs("#authMessage");


      if (message) {

        message.textContent =
          "Logging in...";

      }


      const form =
        new FormData(
          loginForm
        );


      const email =
        String(
          form.get("email") ||
          ""
        ).trim();


      const password =
        String(
          form.get(
            "password"
          ) || ""
        );


      try {

        const data =
          await api(
            "/api/login",
            {

              method:
                "POST",

              body:
                JSON.stringify({

                  email,

                  password

                })

            }
          );


        me =
          data.user;


        if (message) {

          message.textContent =
            "Logged in successfully.";

        }


        loginForm.reset();


        await refreshAccount();


      } catch (error) {

        me = null;


        if (message) {

          message.textContent =
            error.message;

        }

      }

    };

}


/*
=========================================================
LOGOUT
=========================================================
*/

const logoutButton =
  qs("#logoutBtn");


if (logoutButton) {

  logoutButton.onclick =
    async () => {

      try {

        await api(
          "/api/logout",
          {
            method:
              "POST",

            body:
              "{}"
          }
        );

      } catch (
        error
      ) {

        console.error(
          error
        );

      }


      me = null;


      await refreshAccount();

    };

}


/*
=========================================================
NOTES
=========================================================
*/

const note =
  qs("#note");


const noteTitle =
  qs("#noteTitle");


function updateWords() {

  if (
    !note ||
    !qs("#wordCount")
  ) {

    return;

  }


  const text =
    note.value.trim();


  const words =
    text
      ? text.split(
          /\s+/
        ).length
      : 0;


  qs("#wordCount")
    .textContent =
      words +
      " words";

}


async function loadLatestNote() {

  if (
    !note ||
    !noteTitle
  ) {

    return;

  }


  const data =
    await api(

      "/api/notes?browserId=" +

      encodeURIComponent(
        browserId()
      )

    );


  if (
    data.notes.length
  ) {

    currentNote =
      data.notes[0];


    note.value =
      currentNote.content;


    noteTitle.value =
      currentNote.title;

  } else {

    const data =
      await api(
        "/api/notes",
        {

          method:
            "POST",

          body:
            JSON.stringify({

              browserId:
                browserId(),

              title:
                "Untitled",

              content:
                ""

            })

        }
      );


    currentNote =
      data.note;


    note.value =
      "";


    noteTitle.value =
      "Untitled";

  }


  updateWords();

}


let saveTimer;


async function saveNote() {

  if (!currentNote) {

    return;

  }


  try {

    const data =
      await api(

        "/api/notes/" +
        currentNote.id,

        {

          method:
            "PUT",

          body:
            JSON.stringify({

              browserId:
                browserId(),

              title:
                noteTitle.value,

              content:
                note.value

            })

        }

      );


    currentNote =
      data.note;


    if (
      qs("#saveState")
    ) {

      qs("#saveState")
        .textContent =
          "Saved ✓";

    }

  } catch (error) {

    console.error(
      error
    );


    if (
      qs("#saveState")
    ) {

      qs("#saveState")
        .textContent =
          "Save failed";

    }

  }

}


if (note) {

  note.oninput =
    () => {

      updateWords();


      if (
        qs("#saveState")
      ) {

        qs("#saveState")
          .textContent =
            "Saving...";

      }


      clearTimeout(
        saveTimer
      );


      saveTimer =
        setTimeout(
          saveNote,
          650
        );

    };

}


if (noteTitle) {

  noteTitle.oninput =
    () => {

      clearTimeout(
        saveTimer
      );


      saveTimer =
        setTimeout(
          saveNote,
          650
        );

    };

}


/*
=========================================================
NEW NOTE
=========================================================
*/

if (
  qs("#newNote")
) {

  qs("#newNote")
    .onclick =
      async () => {

        const data =
          await api(
            "/api/notes",
            {

              method:
                "POST",

              body:
                JSON.stringify({

                  browserId:
                    browserId(),

                  title:
                    "Untitled",

                  content:
                    ""

                })

            }
          );


        currentNote =
          data.note;


        note.value =
          "";


        noteTitle.value =
          "Untitled";


        updateWords();


        note.focus();

      };

}


/*
=========================================================
NOTE HISTORY
=========================================================
*/

if (
  qs("#historyBtn")
) {

  qs("#historyBtn")
    .onclick =
      async () => {

        if (
          !currentNote
        ) {

          return;

        }


        const data =
          await api(

            `/api/notes/${currentNote.id}/history`

          );


        const panel =
          qs(
            "#historyPanel"
          );


        panel.classList.toggle(
          "hidden"
        );


        panel.innerHTML =
          "<h3>Note history</h3>" +

          (
            data.history.length

              ?

              data.history.map(

                item =>

                  `<div class="campaign">

                    <small>

                      ${
                        new Date(
                          item.created_at
                        )
                        .toLocaleString()
                      }

                    </small>

                    <p>

                      ${
                        escapeHtml(
                          item.content
                            .slice(
                              0,
                              220
                            )
                        )
                      }

                    </p>

                  </div>`

              ).join("")

              :

              "<p>No previous versions yet.</p>"

          );

      };

}


/*
=========================================================
EXPORT
=========================================================
*/

if (
  qs("#exportBtn")
) {

  qs("#exportBtn")
    .onclick =
      () => {

        const url =
          URL.createObjectURL(

            new Blob(
              [
                note.value
              ],
              {
                type:
                  "text/plain"
              }
            )

          );


        const link =
          document.createElement(
            "a"
          );


        link.href =
          url;


        link.download =
          (
            noteTitle.value ||
            "note"
          ) +
          ".txt";


        link.click();


        setTimeout(
          () =>
            URL.revokeObjectURL(
              url
            ),
          500
        );

      };

}


/*
=========================================================
ESCAPE HTML
=========================================================
*/

function escapeHtml(
  value
) {

  return String(
    value
  ).replace(

    /[&<>"]/g,

    character => ({

      "&":
        "&amp;",

      "<":
        "&lt;",

      ">":
        "&gt;",

      '"':
        "&quot;"

    })[
      character
    ]

  );

}


/*
=========================================================
CODE PROJECTS
=========================================================
*/

async function refreshCodeGate() {

  await refreshMe();


  qs("#codeGate")
    ?.classList.toggle(
      "hidden",
      Boolean(me)
    );


  qs("#codeApp")
    ?.classList.toggle(
      "hidden",
      !me
    );


  if (me) {

    await loadProjects();

  }

}


async function loadProjects() {

  const data =
    await api(
      "/api/projects"
    );


  const select =
    qs(
      "#projectSelect"
    );


  if (!select) {

    return;

  }


  select.innerHTML =

    '<option value="">New project</option>'

    +

    data.projects
      .map(

        project =>

          `<option value="${project.id}">

            ${
              escapeHtml(
                project.name
              )
            }

          </option>`

      )
      .join("");

}


function updatePreview() {

  const preview =
    qs("#preview");


  if (!preview) {

    return;

  }


  const html =
    qs("#htmlCode")
      ?.value || "";


  const css =
    qs("#cssCode")
      ?.value || "";


  const js =
    qs("#jsCode")
      ?.value || "";


  preview.srcdoc =

    `<!doctype html>

    <html>

    <head>

      <style>
        ${css}
      </style>

    </head>

    <body>

      ${html}

      <script>

        ${js}

      <\/script>

    </body>

    </html>`;

}


[
  "#htmlCode",
  "#cssCode",
  "#jsCode"
]
.forEach(
  id => {

    if (
      qs(id)
    ) {

      qs(id)
        .oninput =
          updatePreview;

    }

  }
);


updatePreview();


if (
  qs("#projectSelect")
) {

  qs("#projectSelect")
    .onchange =
      async event => {

        const id =
          event.target.value;


        if (!id) {

          currentProject =
            null;

          return;

        }


        const data =
          await api(

            "/api/projects/" +
            id

          );


        currentProject =
          data.project;


        qs("#projectName")
          .value =
            currentProject.name;


        qs("#htmlCode")
          .value =
            currentProject.html;


        qs("#cssCode")
          .value =
            currentProject.css;


        qs("#jsCode")
          .value =
            currentProject.js;


        updatePreview();

      };

}


/*
=========================================================
SAVE PROJECT
=========================================================
*/

if (
  qs("#saveProject")
) {

  qs("#saveProject")
    .onclick =
      async () => {

        await refreshMe();


        if (!me) {

          showPage(
            "account"
          );

          return;

        }


        const body = {

          name:
            qs("#projectName")
              .value,

          html:
            qs("#htmlCode")
              .value,

          css:
            qs("#cssCode")
              .value,

          js:
            qs("#jsCode")
              .value

        };


        let data;


        if (
          currentProject
        ) {

          data =
            await api(

              "/api/projects/" +
              currentProject.id,

              {

                method:
                  "PUT",

                body:
                  JSON.stringify(
                    body
                  )

              }

            );

        } else {

          data =
            await api(
              "/api/projects",
              {

                method:
                  "POST",

                body:
                  JSON.stringify(
                    body
                  )

              }
            );

        }


        currentProject =
          data.project;


        await loadProjects();


        qs("#projectSelect")
          .value =
            currentProject.id;

      };

}


/*
=========================================================
AD DASHBOARD
=========================================================
*/

async function refreshAdsDashboard() {

  await refreshMe();


  qs("#adLoginGate")
    ?.classList.toggle(
      "hidden",
      Boolean(me)
    );


  qs("#adDashboard")
    ?.classList.toggle(
      "hidden",
      !me
    );


  if (me) {

    await loadCampaigns();

  }

}


if (
  qs("#campaignForm")
) {

  qs("#campaignForm")
    .onsubmit =
      async event => {

        event.preventDefault();


        const form =
          Object.fromEntries(

            new FormData(
              event.target
            )

          );


        try {

          await api(
            "/api/campaigns",
            {

              method:
                "POST",

              body:
                JSON.stringify(
                  form
                )

            }
          );


          event.target.reset();


          if (
            event.target
              .budgetDollars
          ) {

            event.target
              .budgetDollars
              .value = 5;

          }


          await loadCampaigns();


        } catch (error) {

          alert(
            error.message
          );

        }

      };

}


/*
=========================================================
CAMPAIGNS
=========================================================
*/

async function loadCampaigns() {

  const data =
    await api(
      "/api/campaigns"
    );


  const list =
    qs(
      "#campaignList"
    );


  if (!list) {

    return;

  }


  list.innerHTML =

    data.campaigns.length

      ?

      data.campaigns.map(

        campaign => {

          const ctr =
            campaign.views

              ?

              (
                campaign.clicks /
                campaign.views *
                100
              ).toFixed(1)

              :

              0;


          return `

            <div class="campaign">

              <h3>
                ${
                  escapeHtml(
                    campaign.name
                  )
                }
              </h3>

              <small>

                ${campaign.status}

                •

                $${(
                  campaign.balance_cents /
                  100
                ).toFixed(2)}

                balance

              </small>

              <p>

                ${campaign.views}
                views

                •

                ${campaign.clicks}
                clicks

                •

                ${ctr}%
                CTR

              </p>

              <button
                onclick="toggleCampaign(${campaign.id})"
              >

                ${
                  campaign.status ===
                  "active"

                    ?
                    "Pause"

                    :
                    "Start"
                }

              </button>

              <button
                onclick="topup(${campaign.id})"
              >

                Add $5

              </button>

            </div>

          `;

        }

      ).join("")

      :

      "<p>No campaigns yet.</p>";

}


window.toggleCampaign =
  async id => {

    await api(
      `/api/campaigns/${id}/toggle`,
      {

        method:
          "POST",

        body:
          "{}"

      }
    );


    await loadCampaigns();

  };


window.topup =
  async id => {

    await api(
      `/api/campaigns/${id}/topup`,
      {

        method:
          "POST",

        body:
          JSON.stringify({
            amountDollars:
              5
          })

      }
    );


    await loadCampaigns();

  };


/*
=========================================================
HOMEPAGE ADS
=========================================================
*/

async function loadHomepageAds() {

  try {

    const data =
      await api(

        "/api/ads?browserId=" +

        encodeURIComponent(
          browserId()
        )

      );


    const slots =
      qsa(
        "#adGrid .ad"
      );


    data.ads.forEach(
      (
        ad,
        index
      ) => {

        if (
          !slots[index]
        ) {

          return;

        }


        const slot =
          slots[index];


        slot.className =
          "ad live";


        slot.innerHTML = `

          <small>
            Advertisement
          </small>

          <strong>

            ${
              escapeHtml(
                ad.headline
              )
            }

          </strong>

          <p>

            ${
              escapeHtml(
                ad.description
              )
            }

          </p>

          <button
            class="primary"
          >

            Visit advertiser

          </button>

        `;


        slot
          .querySelector(
            "button"
          )
          .onclick =
            async () => {

              const result =
                await api(

                  `/api/ads/${ad.id}/click`,

                  {

                    method:
                      "POST",

                    body:
                      JSON.stringify({

                        browserId:
                          browserId()

                      })

                  }

                );


              window.open(

                result.url,

                "_blank",

                "noopener"

              );

            };

      }
    );


  } catch (
    error
  ) {

    console.error(
      "Ads:",
      error
    );

  }

}


/*
=========================================================
ADMIN
=========================================================
*/

if (
  qs("#adminLoad")
) {

  qs("#adminLoad")
    .onclick =
      async () => {

        const message =
          qs(
            "#adminMsg"
          );


        if (message) {

          message.textContent =
            "Logging in...";

        }


        try {

          const response =
            await fetch(
              "/api/admin/stats",
              {

                credentials:
                  "same-origin",

                headers: {

                  "x-admin-password":
                    qs("#adminPass")
                      .value

                }

              }
            );


          const data =
            await response
              .json();


          if (
            !response.ok
          ) {

            throw new Error(
              data.error ||
              "Admin login failed"
            );

          }


          qs("#adminLogin")
            .classList.add(
              "hidden"
            );


          qs("#adminStats")
            .classList.remove(
              "hidden"
            );


          if (message) {

            message.textContent =
              "";

          }


          qs("#stVisits")
            .textContent =
              data.totalVisits;


          qs("#stUnique")
            .textContent =
              data.uniqueVisitors;


          qs("#stUsers")
            .textContent =
              data.users;


          qs("#stCampaigns")
            .textContent =
              data.campaigns;


          qs("#daily")
            .innerHTML =

              "<table>" +

              "<tr>" +

              "<th>Date</th>" +

              "<th>Visits</th>" +

              "<th>Unique browsers</th>" +

              "</tr>"

              +

              data.daily.map(

                row =>

                  `<tr>

                    <td>
                      ${row.date}
                    </td>

                    <td>
                      ${row.visits}
                    </td>

                    <td>
                      ${row.unique_visitors}
                    </td>

                  </tr>`

              ).join("")

              +

              "</table>";


        } catch (
          error
        ) {

          if (message) {

            message.textContent =
              error.message;

          }

        }

      };

}


/*
=========================================================
START APPLICATION
=========================================================
*/

async function start() {

  await refreshMe();


  await refreshAccount();


  try {

    await loadLatestNote();

  } catch (
    error
  ) {

    console.error(
      "Notes failed:",
      error
    );

  }


  await loadHomepageAds();


  const requestedPage =
    location.hash
      .replace(
        "#",
        ""
      );


  const firstPage =
    requestedPage ||
    "home";


  if (
    qs(
      "#" +
      firstPage
    )
  ) {

    showPage(
      firstPage
    );

  }

}


start();
