import gleam/float
import gleam/int
import gleam/list
import gleam/option
import gleam/result
import gleam/string
import gleam_community/colour
import gleam_community/maths
import lustre
import lustre/attribute
import lustre/effect
import lustre/element as lustre_element
import lustre/element/svg
import lustre/event as lustre_event
import plinth/browser/audio
import plinth/browser/document
import plinth/browser/element
import plinth/browser/event
import plinth/browser/window
import plinth/javascript/date
import plinth/javascript/global

pub fn main() {
  let cloud_bounce_audio = audio.new("cloud-bounce.mp3")
  let diamond_collect_audio = audio.new("diamond-collect-simple.mp3")
  let music_audio = audio.new("music.mp3")
  // the whole "to avoid recomputing unchanging svgs, pass them from main"
  // thing seems super dumb. Is there something better?
  let svg_environment =
    svg_environment()
    |> as_static_lustre_component()
  let app =
    lustre.application(
      fn(_: Nil) { init() },
      fn(event, state) {
        update(
          event,
          state,
          music_audio,
          cloud_bounce_audio,
          diamond_collect_audio,
        )
      },
      fn(state) { view(state, svg_environment) },
    )
  // I couldn't get "using custom index.html with lustre/dev start" to work
  element.set_attribute(
    document.body(),
    "style",
    "margin: 0; background: black",
  )
  let assert Ok(_) = lustre.start(app, "#app", Nil)
  Nil
}

type State {
  State(
    specific: StateSpecific,
    window_width: Float,
    window_height: Float,
    held_down_left: Bool,
    held_down_right: Bool,
    lucy_y_highscore: Float,
  )
}

type StateSpecific {
  Running(
    previous_simulation_time: option.Option(Float),
    lucy_angle: Float,
    lucy_x: Float,
    lucy_y: Float,
    lucy_angle_per_second: Float,
    lucy_x_per_second: Float,
    lucy_y_per_second: Float,
    lucy_y_maximum: Float,
    previously_bounced_on_cloud: option.Option(AnimatedStart),
    previously_collected_diamond: option.Option(AnimatedStart),
    remaining_diamond_positions: List(Point),
  )
  Menu(lucy_is_hovered: Bool)
}

type AnimatedStart {
  AnimatedStart(time: Float, position: Point)
}

const initial_running_state_specific: StateSpecific = Running(
  previous_simulation_time: option.None,
  lucy_angle: 0.0,
  lucy_angle_per_second: -0.5,
  lucy_x_per_second: -0.67,
  lucy_y_per_second: 3.75,
  lucy_x: 2.0,
  lucy_y: -4.0,
  lucy_y_maximum: 0.0,
  previously_bounced_on_cloud: option.None,
  previously_collected_diamond: option.None,
  remaining_diamond_positions: all_diamond_positions,
)

const all_diamond_positions: List(Point) = [
  #(0.0, 12.0),
  #(-5.0, 16.0),
  #(3.0, 24.0),
  #(-5.8, 28.75),
  #(4.3, 32.0),
  #(0.0, 45.0),
  #(2.0, 50.0),
  #(6.0, 54.0),
  #(-6.0, 62.0),
  #(6.0, 69.0),
  #(0.0, 69.8),
  #(0.0, 88.65),
]

fn init() -> #(State, effect.Effect(Event)) {
  #(
    State(
      specific: Menu(lucy_is_hovered: False),
      window_height: window.inner_height(window.self()) |> int.to_float,
      window_width: window.inner_width(window.self()) |> int.to_float,
      held_down_left: False,
      held_down_right: False,
      lucy_y_highscore: 0.0,
    ),
    effect.batch([
      effect.from(fn(dispatch) {
        window.add_event_listener("resize", fn(_event) { dispatch(Resized) })
      }),
      effect.from(fn(dispatch) {
        let _ =
          global.set_interval(1000 / 60, fn() { dispatch(SimulationTickPassed) })
        Nil
      }),
      effect.from(fn(dispatch) {
        window.add_event_listener("keydown", fn(e) {
          dispatch(KeyPressed(event.key(e)))
        })
      }),
      effect.from(fn(dispatch) {
        window.add_event_listener("keyup", fn(e) {
          dispatch(KeyReleased(event.key(e)))
        })
      }),
    ]),
  )
}

type Event {
  Resized
  SimulationTickPassed
  KeyPressed(String)
  KeyReleased(String)
  MenuLucyHoverStarted
  MenuLucyHoverEnded
  MenuLucyPressed
}

fn update(
  state: State,
  event: Event,
  music_audio: audio.Audio,
  cloud_bounce_audio: audio.Audio,
  diamond_collect_audio: audio.Audio,
) -> #(State, effect.Effect(Event)) {
  case event {
    MenuLucyHoverStarted -> #(
      State(..state, specific: Menu(lucy_is_hovered: True)),
      effect.none(),
    )
    MenuLucyHoverEnded -> #(
      State(..state, specific: Menu(lucy_is_hovered: False)),
      effect.none(),
    )
    MenuLucyPressed -> {
      let _ = audio.play(music_audio)
      #(State(..state, specific: initial_running_state_specific), effect.none())
    }
    Resized -> #(
      State(
        ..state,
        window_height: window.inner_height(window.self()) |> int.to_float,
        window_width: window.inner_width(window.self()) |> int.to_float,
      ),
      effect.none(),
    )
    KeyPressed(key) -> {
      // I don't have time to hook up js FFI to make the audio repeat
      // so: just try to restart it on any user input
      let _ = audio.play(music_audio)
      case key_as_x_direction(key) {
        option.None -> #(state, effect.none())
        option.Some(Left) -> #(
          State(..state, held_down_left: True),
          effect.none(),
        )
        option.Some(Right) -> #(
          State(..state, held_down_right: True),
          effect.none(),
        )
      }
    }
    KeyReleased(key) -> {
      case key_as_x_direction(key) {
        option.None -> #(state, effect.none())
        option.Some(Left) -> #(
          State(..state, held_down_left: False),
          effect.none(),
        )
        option.Some(Right) -> #(
          State(..state, held_down_right: False),
          effect.none(),
        )
      }
    }
    SimulationTickPassed -> {
      case state.specific {
        Menu(_) -> #(state, effect.none())
        Running(
          previous_simulation_time: maybe_previous_simulation_time,
          lucy_angle: lucy_angle,
          lucy_x: lucy_x,
          lucy_y: lucy_y,
          lucy_x_per_second: lucy_x_per_second,
          lucy_y_per_second: lucy_y_per_second,
          lucy_y_maximum: lucy_y_maximum,
          previously_bounced_on_cloud: maybe_previously_bounced_on_cloud,
          previously_collected_diamond: maybe_previously_collected_diamond,
          remaining_diamond_positions: remaining_diamond_positions,
          lucy_angle_per_second: lucy_angle_per_second,
        ) -> {
          let effective_held_x_direction = case
            state.held_down_left,
            state.held_down_right
          {
            True, False -> -1.0
            False, True -> 1.0
            True, True | False, False -> 0.0
          }
          let current_simulation_time =
            { date.get_time(date.now()) |> int.to_float } /. 1000.0
          let seconds_passed =
            case maybe_previous_simulation_time {
              option.Some(previous_simulation_time) ->
                current_simulation_time -. previous_simulation_time
              option.None -> { 1000 / 60 |> int.to_float } /. 1000.0
            }
            // this is obviously not correct but makes it easy to adjust
            // gameplay speed
            *. 3.5
          let new_lucy_y_per_second =
            lucy_y_per_second -. { 1.0 *. seconds_passed }
            |> float.max(-2.2)
          let new_lucy_x_per_second =
            lucy_x_per_second
            *. { 1.0 -. { 0.2 *. seconds_passed } }
            +. {
              effective_held_x_direction
              *. {
                4.4
                -. float.absolute_value(
                  lucy_x_per_second +. effective_held_x_direction *. 2.2,
                )
              }
              *. 3.0
              *. seconds_passed
            }
          let new_lucy_y = lucy_y +. { new_lucy_y_per_second *. seconds_passed }
          let new_lucy_x_not_wrapped =
            lucy_x +. { new_lucy_x_per_second *. seconds_passed }
          let new_lucy_x = case
            new_lucy_x_not_wrapped
            <. float.negate(screen_width /. 2.0 +. lucy_radius)
          {
            True ->
              new_lucy_x_not_wrapped +. { screen_width +. lucy_radius *. 2.0 }
            False ->
              case
                new_lucy_x_not_wrapped >. screen_width /. 2.0 +. lucy_radius
              {
                True ->
                  new_lucy_x_not_wrapped
                  -. { screen_width +. lucy_radius *. 2.0 }
                False -> new_lucy_x_not_wrapped
              }
          }
          let lucy_falls_on_cloud: option.Option(Point) = case
            new_lucy_y_per_second >. 0.0
          {
            True -> option.None
            False -> {
              cloud_positions
              |> list.find(fn(cloud_position) {
                let #(cloud_x, cloud_y) = cloud_position
                {
                  float.absolute_value(new_lucy_y -. cloud_y)
                  <=. { cloud_height /. 2.0 }
                }
                && {
                  float.absolute_value(new_lucy_x -. cloud_x)
                  <=. { cloud_width /. 2.0 }
                }
              })
              |> option.from_result
            }
          }
          let new_lucy_y_per_second = case lucy_falls_on_cloud {
            option.Some(_) -> 2.59
            option.None -> new_lucy_y_per_second
          }
          let new_lucy_angle_per_second = case effective_held_x_direction {
            0.0 -> lucy_angle_per_second
            _ -> effective_held_x_direction *. -1.2
          }
          case new_lucy_y <. float.negate(screen_height *. 0.9) {
            True -> #(
              State(
                specific: initial_running_state_specific,
                window_width: state.window_width,
                window_height: state.window_height,
                held_down_left: state.held_down_left,
                held_down_right: state.held_down_right,
                lucy_y_highscore: lucy_y_maximum,
              ),
              effect.none(),
            )
            False -> {
              let _ = case lucy_falls_on_cloud {
                option.Some(_) -> {
                  // monotone, consider variating pitch and adjusting volume
                  let _ = audio.play(cloud_bounce_audio)
                  Nil
                }
                option.None -> Nil
              }
              let maybe_collected_diamond =
                remaining_diamond_positions
                |> list.find(fn(remaining_diamond_position) {
                  let #(diamond_x, diamond_y) = remaining_diamond_position
                  {
                    float.absolute_value(new_lucy_y -. diamond_y)
                    <=. diagonal_diamond_size *. 1.55
                  }
                  && {
                    float.absolute_value(new_lucy_x -. diamond_x)
                    <=. diagonal_diamond_size *. 1.55
                  }
                })
                |> option.from_result
              let _ = case maybe_collected_diamond {
                option.None -> Nil

                option.Some(_) -> {
                  let _ = audio.play(diamond_collect_audio)
                  Nil
                }
              }
              #(
                State(
                  ..state,
                  specific: Running(
                    previous_simulation_time: option.Some(
                      current_simulation_time,
                    ),
                    lucy_angle: lucy_angle
                      +. { new_lucy_angle_per_second *. seconds_passed },
                    lucy_angle_per_second: new_lucy_angle_per_second,
                    lucy_y_per_second: new_lucy_y_per_second,
                    lucy_y: lucy_y
                      +. { new_lucy_y_per_second *. seconds_passed },
                    lucy_x_per_second: new_lucy_x_per_second,
                    lucy_x: new_lucy_x,
                    lucy_y_maximum: lucy_y_maximum |> float.max(new_lucy_y),
                    previously_bounced_on_cloud: case lucy_falls_on_cloud {
                      option.None -> maybe_previously_bounced_on_cloud
                      option.Some(bounced_on_cloud) ->
                        option.Some(AnimatedStart(
                          time: current_simulation_time,
                          position: bounced_on_cloud,
                        ))
                    },
                    previously_collected_diamond: case maybe_collected_diamond {
                      option.None -> maybe_previously_collected_diamond
                      option.Some(collected_diamond) ->
                        option.Some(AnimatedStart(
                          time: current_simulation_time,
                          position: collected_diamond,
                        ))
                    },
                    remaining_diamond_positions: case maybe_collected_diamond {
                      option.None -> remaining_diamond_positions
                      option.Some(collected_position) ->
                        remaining_diamond_positions
                        |> list.filter(fn(remaining_diamond_position) {
                          remaining_diamond_position != collected_position
                        })
                    },
                  ),
                ),
                effect.none(),
              )
            }
          }
        }
      }
    }
  }
}

type XDirection {
  Left
  Right
}

fn key_as_x_direction(key: String) -> option.Option(XDirection) {
  case key {
    "ArrowLeft" -> option.Some(Left)
    "ArrowRight" -> option.Some(Right)
    "a" -> option.Some(Left)
    "d" -> option.Some(Right)
    _ -> option.None
  }
}

const screen_width: Float = 16.0

const screen_height: Float = 9.0

const goal_y: Float = 100.0

fn view(
  state: State,
  svg_environment: lustre_element.Element(_event),
) -> lustre_element.Element(Event) {
  let ration_width_to_height: Float = screen_width /. screen_height
  let #(svg_width, svg_height) = case
    state.window_width <. state.window_height *. ration_width_to_height
  {
    True ->
      // disproportional in height
      #(state.window_width, state.window_width /. ration_width_to_height)

    False ->
      // might be disproportional in width
      #(state.window_height *. ration_width_to_height, state.window_height)
  }

  svg.svg(
    [
      attribute.style("position", "absolute"),
      attribute.style(
        "right",
        { { state.window_width -. svg_width } /. 2.0 } |> float.to_string
          <> "px",
      ),
      attribute.style(
        "bottom",
        { { state.window_height -. svg_height } /. 2.0 } |> float.to_string
          <> "px",
      ),
      attribute.width(svg_width |> float.truncate),
      attribute.height(svg_height |> float.truncate),
    ],
    [
      case state.specific {
        Menu(lucy_is_hovered: lucy_is_hovered) ->
          svg.g(
            [
              lustre_event.on_mouse_down(MenuLucyPressed),
            ],
            [
              svg.rect([
                attribute.attribute("y", "-100%"),
                attribute.attribute("width", "100%"),
                attribute.attribute("height", "100%"),
                attribute.attribute(
                  "fill",
                  colour.from_rgb(0.0, 0.45, 0.6)
                    |> result.unwrap(colour.black)
                    |> colour.to_css_rgba_string,
                ),
              ]),
              svg.text(
                [
                  attribute.attribute(
                    "x",
                    screen_width /. 2.0 |> float.to_string,
                  ),
                  attribute.attribute(
                    "y",
                    screen_height *. 0.75 |> float.to_string,
                  ),
                  attribute.attribute("pointer-events", "none"),
                  attribute.style("text-anchor", "middle"),
                  attribute.style("font-weight", "bold"),
                  attribute.style("font-size", "1.1px"),
                  attribute.style("font-family", "\"cubano\", monaco, courier"),
                  attribute.style("fill", "white"),
                ],
                "←/→ or a/d",
              )
                |> svg_scale_xy(1.0, -1.0),
              svg.g([], [
                svg_environment,
                case lucy_is_hovered {
                  True ->
                    svg_lucy(True)
                    |> svg_rotate(maths.pi() *. 0.05)
                  False -> svg_lucy(False)
                }
                  |> svg_scale_each(1.5),
                svg.circle([
                  lustre_event.on_mouse_enter(MenuLucyHoverStarted),
                  lustre_event.on_mouse_leave(MenuLucyHoverEnded),
                  attribute.attribute(
                    "fill",
                    colour.from_rgba(1.0, 1.0, 1.0, 0.01)
                      |> result.unwrap(colour.black)
                      |> colour.to_css_rgba_string,
                  ),
                  attribute.attribute("r", "1.5"),
                ]),
              ])
                |> svg_translate(
                  screen_width /. 2.0,
                  float.negate(screen_height *. 0.5),
                ),
            ],
          )
        Running(
          previous_simulation_time: maybe_previous_simulation_time,
          lucy_angle: lucy_angle,
          lucy_x: lucy_x,
          lucy_y: lucy_y,
          lucy_angle_per_second: _,
          lucy_x_per_second: _,
          lucy_y_per_second: lucy_y_per_second,
          lucy_y_maximum: _,
          previously_bounced_on_cloud: maybe_previously_bounced_on_cloud,
          previously_collected_diamond: maybe_previously_collected_diamond,
          remaining_diamond_positions: remaining_diamond_positions,
        ) -> {
          let progress: Float =
            lucy_y *. { 1.0 /. goal_y }
            |> float.max(0.0)
            |> float.min(1.0)
          let diamond_animation_progress =
            // depending on real time would make it much smoother
            float.absolute_value(
              {
                {
                  maths.sin(
                    { maybe_previous_simulation_time |> option.unwrap(0.0) }
                    *. 5.0,
                  )
                }
                +. 1.0
              }
              /. 2.0,
            )
          let svg_diamond_grey = svg_diamond_grey(diamond_animation_progress)
          let svg_diamond = svg_diamond(diamond_animation_progress)
          let svg_diamonds =
            svg.g(
              [],
              remaining_diamond_positions
                |> list.map(fn(remaining_diamond_position) {
                  let #(x, y) = remaining_diamond_position
                  svg_diamond |> svg_translate(x, y)
                }),
            )
          let svg_previously_collected_diamond_animation = case
            maybe_previously_collected_diamond,
            maybe_previous_simulation_time
          {
            option.None, _ | _, option.None -> lustre_element.none()
            option.Some(previously_collected_diamond),
              option.Some(previous_simulation_time)
            -> {
              let #(x, y) = previously_collected_diamond.position
              svg_diamond
              |> svg_scale_each(
                1.0
                -. {
                  previous_simulation_time -. previously_collected_diamond.time
                },
              )
              |> svg_translate(
                x
                  -. {
                  x
                  *. 0.5
                  *. {
                    {
                      previous_simulation_time
                      -. previously_collected_diamond.time
                    }
                    |> float.min(1.0)
                  }
                },
                y
                  +. 15.0
                  *. {
                  float.power(
                    previous_simulation_time
                      -. previously_collected_diamond.time,
                    2.0,
                  )
                  |> result.unwrap(1.0)
                },
              )
            }
          }
          let svg_previously_bounced_on_cloud_animation = case
            maybe_previously_bounced_on_cloud,
            maybe_previous_simulation_time
          {
            option.None, _ | _, option.None -> lustre_element.none()
            option.Some(previously_bounced_on_cloud),
              option.Some(previous_simulation_time)
            -> {
              let #(x, y) = previously_bounced_on_cloud.position
              svg.g(
                [
                  attribute.attribute(
                    "opacity",
                    0.29
                    -. {
                      0.7
                      *. {
                        previous_simulation_time
                        -. previously_bounced_on_cloud.time
                      }
                    }
                      |> float.max(0.0)
                      |> float.to_string,
                  ),
                ],
                [svg_cloud()],
              )
              |> svg_scale_xy(
                1.0
                  +. 1.1
                  *. {
                  previous_simulation_time -. previously_bounced_on_cloud.time
                },
                {
                  1.4
                  -. {
                    previous_simulation_time -. previously_bounced_on_cloud.time
                  }
                }
                  |> float.max(0.0),
              )
              |> svg_translate(
                x,
                y
                  -. 1.6
                  *. {
                  previous_simulation_time -. previously_bounced_on_cloud.time
                },
              )
            }
          }
          let svg_summary_of_collected_diamonds = {
            let all_diamonds_count = all_diamond_positions |> list.length
            let remaining_diamonds_count =
              remaining_diamond_positions |> list.length
            let collected_diamonds_count =
              all_diamonds_count - remaining_diamonds_count
            list.range(0, all_diamonds_count - 1)
            |> list.map(fn(diamond_index) {
              let diamond_percentage =
                { diamond_index |> int.to_float }
                /. { { all_diamonds_count |> int.to_float } -. 1.0 }
              case diamond_index < collected_diamonds_count {
                True -> svg_diamond
                False -> svg_diamond_grey
              }
              |> svg_translate(
                // I cannot explain this to you or me, sorry
                -0.2 +. 3.0 *. maths.cos(maths.pi() *. diamond_percentage),
                102.0 +. 3.0 *. maths.sin(maths.pi() *. diamond_percentage),
              )
            })
            |> svg.g([], _)
          }
          svg.g([], [
            svg.rect([
              attribute.attribute("y", "-100%"),
              attribute.attribute("width", "100%"),
              attribute.attribute("height", "100%"),
              attribute.attribute(
                "fill",
                colour.from_rgb(
                  lucy_y *. { -1.0 /. screen_height }
                    |> float.max(0.0)
                    |> float.min(0.7),
                  { 0.45 -. { progress *. 0.6 } } |> float.max(0.0),
                  0.6 -. { progress *. 0.56 } |> float.max(0.095),
                )
                  |> result.unwrap(colour.black)
                  |> colour.to_css_rgba_string,
              ),
            ]),
            svg.text(
              [
                attribute.attribute("x", screen_width /. 2.0 |> float.to_string),
                attribute.attribute(
                  "y",
                  screen_height *. 0.95 |> float.to_string,
                ),
                attribute.attribute("pointer-events", "none"),
                attribute.style("text-anchor", "middle"),
                attribute.style("font-weight", "bold"),
                attribute.style("font-size", "1px"),
                attribute.style("font-family", "\"cubano\", monaco, courier"),
                attribute.style(
                  "text-shadow",
                  "-1px 0 black, 0 1px black, 1px 0 black, 0 -1px black, -2px 2px black, -1.8px 1.8px black, -1.6px 1.6px black, -1.5px 1.5px black, -1px 1px black, -3px 3px black, -2px 2px black, -1px 1px black",
                ),
                attribute.style(
                  "fill",
                  colour.from_rgb(0.9, 1.0, 0.86)
                    |> result.unwrap(colour.black)
                    |> colour.to_css_rgba_string,
                ),
              ],
              lucy_y |> float.truncate |> int.to_string <> "m",
            )
              |> svg_scale_xy(1.0, -1.0),

            svg.g([], [
              svg_summary_of_collected_diamonds,
              svg_diamonds,
              svg_previously_collected_diamond_animation,
              svg_previously_bounced_on_cloud_animation,
              svg_lucy(lucy_y_per_second <. -0.8)
                |> svg_scale_each(0.5)
                |> svg_rotate(lucy_angle)
                |> svg_translate(lucy_x, lucy_y),
              svg_environment,
            ])
              |> svg_translate(
                screen_width /. 2.0,
                float.negate(screen_height *. 0.56)
                  -. { lucy_y |> float.max(0.0) },
              ),
          ])
        }
      }
      |> svg_scale_xy(
        svg_width /. screen_width,
        float.negate(svg_height /. screen_height),
      ),
    ],
  )
}

const diagonal_diamond_size: Float = 0.42

fn svg_diamond(animation_progress: Float) -> lustre_element.Element(_event) {
  svg.g([], [
    svg.polygon([
      attribute.attribute("points", "-2,0 -1,1 0,0"),
      attribute.attribute("fill", "#64b5f6"),
    ]),
    svg.polygon([
      attribute.attribute("points", "-1,1 0,0 1,1"),
      attribute.attribute("fill", "#2196f3"),
    ]),
    svg.polygon([
      attribute.attribute("points", "0,0 1,1 2,0"),
      attribute.attribute("fill", "#1976d2"),
    ]),
    svg.polygon([
      attribute.attribute("points", "-2,0 0,-1.5 2,0"),
      attribute.attribute("fill", "#3a8accff"),
    ]),
  ])
  |> svg_translate(0.0, 0.25)
  |> svg_scale_xy(
    0.1 *. 1.38 +. { animation_progress *. 0.007 },
    0.141 *. 1.38 +. { animation_progress *. 0.007 },
  )
  |> svg_rotate({ -0.5 +. animation_progress } *. 0.17)
}

fn svg_diamond_grey(animation_progress: Float) -> lustre_element.Element(_event) {
  svg.g([], [
    svg.polygon([
      attribute.attribute("points", "-2,0 -1,1 0,0"),
      attribute.attribute("fill", "#b3b3b3ff"),
    ]),
    svg.polygon([
      attribute.attribute("points", "-1,1 0,0 1,1"),
      attribute.attribute("fill", "#9c9c9cff"),
    ]),
    svg.polygon([
      attribute.attribute("points", "0,0 1,1 2,0"),
      attribute.attribute("fill", "#888888ff"),
    ]),
    svg.polygon([
      attribute.attribute("points", "-2,0 0,-1.5 2,0"),
      attribute.attribute("fill", "#9b9b9bff"),
    ]),
  ])
  |> svg_translate(0.0, 0.25)
  |> svg_scale_xy(
    0.1 *. 1.38 +. { animation_progress *. 0.007 },
    0.141 *. 1.38 +. { animation_progress *. 0.007 },
  )
  |> svg_rotate({ -0.5 +. animation_progress } *. 0.17)
}

fn star_positions() -> List(Point) {
  list.range(
    screen_width *. -1.0 |> float.truncate,
    screen_width |> float.truncate,
  )
  |> list.flat_map(fn(x_thirds) {
    let x = { x_thirds |> int.to_float } *. 0.5
    let y_start_randomness =
      12_432_058_259.3248093284923 *. { x_thirds |> int.to_float }
      |> float.modulo(1.0)
      |> result.unwrap(0.0)
    let y_start = goal_y *. 0.3 +. y_start_randomness *. 12.0

    list.range(0, goal_y *. 0.12 |> float.truncate)
    |> list.map(fn(y_index) {
      let randomness =
        12_432_058_259.20756244 *. y_start_randomness
        |> float.modulo(1.0)
        |> result.unwrap(0.0)
      #(
        x,
        y_start
          +. {
          y_index |> int.to_float |> float.power(0.5) |> result.unwrap(0.0)
        }
          *. 15.0
          +. randomness
          *. 10.0,
      )
    })
  })
}

fn svg_environment() -> lustre_element.Element(_event) {
  let svg_bird = svg_bird()
  let svg_birds =
    svg.g(
      [],
      [
        #(4.4, -4.4, 1.5),
        #(-2.9, -4.3, 1.1),
        #(2.4, -3.7, 0.5),
        #(5.4, -3.4, 1.5),
        #(2.0, 1.0, 1.0),
        #(5.0, 3.0, 0.5),
        #(-5.2, 5.0, 0.5),
        #(4.0, 7.0, 1.2),
        #(-4.8, 8.0, 1.2),
        #(4.6, 9.0, 0.3),
        #(1.0, 11.0, 0.4),
        #(-4.0, 12.8, 0.4),
        #(1.4, 14.0, 0.9),
        #(1.0, 16.0, 0.9),
        #(4.6, 18.5, 0.4),
        #(0.0, 20.0, 0.9),
        #(-4.0, 122.8, 0.4),
        #(1.4, 24.0, 0.9),
        #(-4.8, 24.1, 1.0),
        #(-4.0, 25.6, 0.6),
        #(1.0, 26.0, 0.9),
        #(4.9, 30.2, 0.9),
      ]
        |> list.map(fn(position) {
          let #(x, y, scale) = position
          svg_bird
          |> svg_scale_each(scale)
          |> svg_translate(x, y)
        }),
    )
  let svg_stars =
    svg.g(
      [],
      star_positions()
        |> list.map(fn(star_position) {
          let #(x, y) = star_position
          svg_small_star()
          |> svg_translate(x, y)
        }),
    )
  let svg_cloud = svg_cloud()
  let clouds_svg =
    svg.g(
      [],
      cloud_positions
        |> list.map(fn(position) {
          let #(x, y) = position
          svg_cloud |> svg_translate(x, y)
        }),
    )
  let svg_fog = svg_fog()
  let fog_svg =
    svg.g(
      [],
      // I'd love to add more bug it seems to be extremely taxing to render
      [
        #(2.4, -4.4, 1.5),
        #(2.0, 1.0, 1.0),
        #(-2.0, 5.0, 0.5),
        #(4.0, 10.0, 1.2),
        #(4.6, 14.0, 0.2),
        #(1.0, 20.0, 0.2),
        #(-4.0, 24.8, 0.4),
        #(1.4, 30.0, 0.9),
        #(1.0, 60.0, 0.9),
        #(4.6, 84.5, 0.4),
        #(0.0, 100.0, 0.9),
      ]
        |> list.map(fn(position) {
          let #(x, y, scale) = position
          svg_fog
          |> svg_scale_each(scale)
          |> svg_translate(x, y)
        }),
    )
  svg.g([], [
    clouds_svg,
    fog_svg,
    svg_stars,
    svg_birds,
    svg_moon()
      |> svg_translate(0.0, 101.0),
  ])
}

fn svg_small_star() -> lustre_element.Element(_event) {
  svg.rect([
    attribute.attribute("width", "0.01"),
    attribute.attribute("height", "0.01"),
    attribute.attribute("fill", "white"),
  ])
}

fn svg_bird() -> lustre_element.Element(_event) {
  let color =
    colour.from_rgb(0.4, 0.6, 0.8)
    |> result.unwrap(colour.white)
    |> colour.to_css_rgba_string
  let wing_radius = 0.2
  let wing =
    svg.circle([
      attribute.attribute("r", wing_radius |> float.to_string),
      attribute.attribute("fill", "none"),
      attribute.attribute("stroke", color),
      attribute.attribute("stroke-width", "0.03"),
      attribute.attribute("pathLength", "320"),
      attribute.attribute("stroke-dasharray", "90 270"),
      attribute.attribute("stroke-linecap", "round"),
    ])
  svg.g([], [
    wing,
    wing
      |> svg_scale_xy(-1.0, 1.0)
      |> svg_translate(wing_radius *. 2.0, 0.0),
  ])
  |> svg_scale_xy(1.49, 1.0)
}

fn svg_lucy(is_excited: Bool) -> lustre_element.Element(event) {
  let svg_eye = case is_excited {
    True -> lucy_closed_eye()
    False ->
      svg.circle([
        attribute.attribute("r", "0.08"),
        attribute.attribute("fill", "black"),
      ])
  }
  let svg_cheek =
    svg.circle([
      attribute.attribute("r", "0.05"),
      attribute.attribute(
        "fill",
        case is_excited {
          False -> colour.from_rgba(1.0, 0.0, 0.0, 0.1)
          True -> colour.from_rgba(1.0, 0.0, 0.0, 0.2)
        }
          |> result.unwrap(colour.red)
          |> colour.to_css_rgba_string,
      ),
    ])
  let svg_mouth =
    svg.circle([
      attribute.attribute("cy", "0.0"),
      attribute.attribute("cx", "0"),
      attribute.attribute("r", "0.12"),
      attribute.attribute("fill", "none"),
      attribute.attribute("stroke", "black"),
      attribute.attribute("stroke-width", "0.06"),
      attribute.attribute("pathLength", "360"),
      attribute.attribute("stroke-dasharray", "0 180 180"),
      attribute.attribute("stroke-linecap", "round"),
    ])
  svg.g([], [
    svg.path([
      attribute.attribute("stroke-width", "0.23"),
      attribute.attribute("stroke-linejoin", "round"),
      attribute.attribute(
        "stroke",
        lucy_color()
          |> colour.to_css_rgba_string,
      ),
      attribute.attribute(
        "fill",
        lucy_color()
          |> colour.to_css_rgba_string,
      ),
      attribute.attribute("d", lucy_path()),
    ])
      |> svg_rotate(-0.33),
    svg_eye
      |> svg_translate(-0.3, 0.12),
    svg_eye
      |> svg_rotate(maths.pi())
      |> svg_translate(0.3, 0.12),
    svg_cheek
      |> svg_translate(-0.3, -0.08),
    svg_cheek
      |> svg_translate(0.3, -0.08),
    svg_mouth,
  ])
}

fn lucy_closed_eye() -> lustre_element.Element(_event) {
  svg.polyline([
    attribute.attribute("points", "-0.07,0.15 0.1,0.0 -0.07,-0.15"),
    attribute.attribute("fill", "none"),
    attribute.attribute("stroke", "black"),
    attribute.attribute("stroke-width", "0.08"),
    attribute.attribute("stroke-linecap", "round"),
    attribute.attribute("stroke-linejoin", "round"),
  ])
  |> svg_scale_each(0.7)
}

/// try to make svg_lucy etc depend on it in some form
const lucy_radius = 0.5

fn lucy_path() -> String {
  "M 0,0\n"
  <> lucy_shape_points()
  |> list.map(fn(points) {
    let #(inner, outer) = points
    let #(x, y) = inner
    let #(ox, oy) = outer
    "Q "
    <> x |> float.to_string
    <> ","
    <> y |> float.to_string
    <> " "
    <> ox |> float.to_string
    <> ","
    <> oy |> float.to_string
  })
  |> string.join("\n")
  <> "\nz"
}

fn lucy_shape_points() -> List(#(Point, Point)) {
  let angle_step = 2.0 *. maths.pi() /. 5.0
  list.range(0, 5)
  |> list.map(fn(i) {
    let angle = angle_step *. { i |> int.to_float }
    #(#(maths.cos(angle), maths.sin(angle)) |> point_scale_by(0.268), #(
      maths.cos(angle +. { angle_step /. 2.0 }),
      maths.sin(angle +. { angle_step /. 2.0 }),
    ))
  })
}

fn lucy_color() {
  colour.from_rgb(1.0, 0.5, 1.0)
  |> result.unwrap(colour.black)
}

fn svg_moon() {
  let color =
    colour.from_rgb(0.2, 0.0, 0.6)
    |> result.unwrap(colour.white)
    |> colour.to_css_rgba_string
  let svg_eye =
    lucy_closed_eye()
    |> svg_rotate(maths.pi() /. 2.0)
  let svg_cheek =
    svg.circle([
      attribute.attribute("r", "0.1"),
      attribute.attribute(
        "fill",
        colour.from_rgba(1.0, 0.2, 0.7, 0.28)
          |> result.unwrap(colour.red)
          |> colour.to_css_rgba_string,
      ),
    ])
  let svg_face =
    svg.g([], [
      svg_eye
        |> svg_translate(-0.3, 0.12),
      svg_eye
        |> svg_translate(0.3, 0.12),
      svg_cheek
        |> svg_translate(-0.5, -0.1),
      svg_cheek
        |> svg_translate(0.5, -0.1),
    ])
  svg.g([], [
    svg.path([
      attribute.attribute(
        "d",
        "M5.0 2.0A4.0 4.0 0 1 0 5.0 7.0 3.0 3.0 0 1 1 5.0 2.0z",
      ),
      attribute.attribute("stroke", color),
      attribute.attribute("stroke-width", "1.0"),
      attribute.attribute("stroke-linejoin", "round"),
      attribute.attribute("fill", color),
    ])
      |> svg_scale_each(0.4)
      |> svg_translate(-0.8, -1.6),
    svg_face |> svg_translate(-1.1, 0.1),
  ])
}

fn svg_fog() -> lustre_element.Element(event) {
  // I would love to split these into 2 elements with different opacity
  // but that slows rendering
  svg.path([
    attribute.attribute(
      "d",
      "M -6.0,0.0 Q 2.0,1.5 6.0,1.0 Q -2.0,-1.0 -6.0 0.0 M -12.0,-1.0 Q 2.0,0.1 1.0,-0.8 Q -2.0,-1.5 -8.0 -1.2",
    ),
    attribute.attribute(
      "fill",
      colour.from_rgba(1.0, 1.0, 1.0, 0.029)
        |> result.unwrap(colour.white)
        |> colour.to_css_rgba_string,
    ),
  ])
}

fn cloud_color() {
  colour.from_rgb(0.9, 1.0, 0.86)
  |> result.unwrap(colour.black)
  |> colour.to_css_rgba_string
}

fn svg_cloud() -> lustre_element.Element(event) {
  let color = cloud_color()
  svg.g([], [
    svg.circle([
      attribute.attribute("fill", color),
      attribute.attribute("cy", "0.12"),
      attribute.attribute("cx", "-0.27"),
      attribute.attribute("r", "0.25"),
    ]),
    svg.circle([
      attribute.attribute("fill", color),
      attribute.attribute("cy", "0.12"),
      attribute.attribute("cx", "0.12"),
      attribute.attribute("r", "0.3"),
    ]),
    svg.circle([
      attribute.attribute("fill", color),
      attribute.attribute("cy", "-0.17"),
      attribute.attribute("cx", "0.3"),
      attribute.attribute("r", "0.21"),
    ]),
    svg.circle([
      attribute.attribute("fill", color),
      attribute.attribute("cx", "0.5"),
      attribute.attribute("r", "0.15"),
    ]),
  ])
  |> svg_scale_each(1.2)
}

const cloud_positions: List(Point) = [
  #(-4.0, -4.0),
  #(-6.0, -2.0),
  #(-1.2, 1.8),
  #(4.9, 3.8),
  #(1.2, 4.0),
  #(-1.5, 5.4),
  #(1.2, 6.1),
  #(3.2, 9.1),
  #(-3.5, 9.3),
  #(0.0, 9.8),
  #(-3.1, 11.3),
  #(3.1, 12.3),
  #(-2.7, 14.0),
  #(2.5, 15.0),
  #(0.0, 18.0),
  #(-0.2, 21.0),
  #(0.1, 24.0),
  #(4.1, 23.0),
  #(4.1, 26.0),
  #(2.0, 27.0),
  #(0.0, 28.0),
  #(-2.0, 29.0),
  #(-4.0, 30.05),
  #(-4.0, 30.05),
  #(-6.0, 32.05),
  #(-4.1, 33.0),
  #(-4.1, 36.0),
  #(-2.0, 37.0),
  #(0.2, 39.0),
  #(-0.1, 34.0),
  #(0.0, 41.0),
  #(6.0, 44.0),
  #(-6.0, 47.0),
  #(2.0, 49.0),
  #(-6.0, 51.0),
  #(-5.4, 52.6),
  #(2.0, 53.0),
  #(-5.6, 56.9),
  #(-5.8, 56.5),
  #(2.0, 59.5),
  #(0.0, 62.0),
  #(0.4, 63.6),
  #(0.7, 64.1),
  #(-6.0, 66.6),
  #(4.4, 69.6),
  #(4.7, 70.1),
  #(-4.4, 73.6),
  #(-4.7, 74.1),
  #(4.4, 77.2),
  #(-6.7, 78.7),
  #(4.4, 79.6),
  #(4.7, 80.1),
  #(0.1, 81.1),
  #(0.0, 81.6),
  #(-0.2, 81.1),
  #(-1.7, 82.7),
  #(-0.9, 83.1),
  #(-3.9, 84.1),
  #(3.9, 84.1),
  #(-2.9, 85.1),
  #(2.9, 85.1),
  #(-1.9, 86.1),
  #(1.9, 86.1),
  #(-0.9, 87.1),
  #(0.9, 87.1),
  #(0.0, 90.1),
  #(0.2, 93.1),
  #(-3.7, 93.2),
  #(3.4, 93.2),
  #(-0.2, 95.7),
  #(0.7, 95.9),
  #(-1.2, 96.0),
  #(-5.1, 96.0),
  #(4.0, 96.1),
  #(-0.8, 96.1),
  #(0.3, 96.1),
  #(0.4, 96.3),
  #(-1.1, 96.5),
  #(-0.6, 96.6),
  #(0.1, 96.7),
  #(-1.9, 97.0),
  #(-0.4, 97.1),
]

const cloud_width: Float = 2.0

const cloud_height: Float = 1.1

fn svg_scale_each(
  svg: lustre_element.Element(event),
  factor: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "scale(" <> { factor |> float.to_string } <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_scale_xy(
  svg: lustre_element.Element(event),
  x: Float,
  y: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "scale("
          <> { x |> float.to_string }
          <> ", "
          <> { y |> float.to_string }
          <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_translate(
  svg: lustre_element.Element(event),
  x: Float,
  y: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "translate("
          <> { x |> float.to_string }
          <> ", "
          <> { y |> float.to_string }
          <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_rotate(
  svg: lustre_element.Element(event),
  angle: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "rotate(" <> angle /. maths.pi() *. 180.0 |> float.to_string <> ")",
      ),
    ],
    [svg],
  )
}

type Point =
  #(Float, Float)

fn point_scale_by(point: Point, scale: Float) -> Point {
  let #(x, y) = point
  #(x *. scale, y *. scale)
}

/// to prevent dom diffing.
fn as_static_lustre_component(
  node: lustre_element.Element(_event),
) -> lustre_element.Element(_event) {
  // ↓ is not really noticeably faster :(
  lustre_element.unsafe_raw_html(
    "http://www.w3.org/2000/svg",
    "g",
    [],
    node |> lustre_element.to_string,
  )
  node
  // I also tried using a web component but it didn't render.
  // Is there a lustre primitive that I'm missing?
}
